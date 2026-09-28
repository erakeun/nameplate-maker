/* Explicit review and print confirmation UI, using the existing nameplate renderer. */
function mountMachNameplates(adapter) {
  'use strict';
  const M = NameplateChanges, state = adapter.state;
  const panel = document.createElement('section');
  panel.id = 'mach-nameplate-panel'; panel.className = 'mach-panel';
  panel.innerHTML = `<h2>변경분 확인 · 출력 관리</h2><p id="mach-event-label"></p><p>연결 버튼으로 연 같은 PC·브라우저 창에서 확인 후 반영합니다. 다른 PC에서는 각 도구의 작업 파일과 연동 JSON을 저장·복원하세요. 다운로드한 PDF와 출력한 종이는 자동 갱신되지 않습니다.</p><div class="mach-actions"><button id="mach-import" class="btn">변경분 JSON 가져오기</button><button id="mach-undo" class="btn">직전 변경 되돌리기</button><button id="mach-backup" class="btn">변경 전 작업 백업 저장</button><button id="mach-print-report" class="btn">출력 상태 전달</button><button id="mach-print-export" class="btn">출력 상태 JSON 저장</button></div><input type="file" id="mach-file" accept=".json,application/json" hidden><p id="mach-link-status" role="status"></p><details open><summary>신규·수정 출력 및 회수</summary><div class="mach-actions"><label><input type="checkbox" id="mach-changed-only" checked> 변경된 명패만</label><button class="btn" id="mach-select-all">표시 명패 전체 선택</button><button class="btn" id="mach-preview">선택 명패 미리보기</button><button class="btn primary" id="mach-print-selected">선택 명패 인쇄·PDF</button></div><div id="mach-print-list"></div><p>기존 기록이 없는 명패는 출력 여부 미확인입니다. 인쇄 창·PDF 저장만으로 완료 처리하지 않습니다.</p><button class="btn" id="mach-set-baseline">현재 선택 명패를 실물 출력 기준본으로 지정</button><h3>출력 작업별 완료 확인</h3><div id="mach-jobs"></div><h3>기존 명패 회수</h3><div id="mach-recalls"></div></details>`;
  const style = document.createElement('style');
  style.textContent = `.mach-panel{margin:16px 24px;padding:20px;border:1px solid #d6e0eb;border-radius:14px;background:white;color:#142c45}.mach-panel p{font-size:13px;line-height:1.6;margin:10px 0}.mach-actions{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin:12px 0}.mach-row{border-bottom:1px solid #dae1e9;padding:12px 0;overflow-wrap:anywhere}.mach-row input[type=checkbox]{width:18px;height:18px;vertical-align:middle}.mach-row label{line-height:1.7}.mach-dialog{width:min(820px,calc(100% - 24px));max-height:88vh;overflow:auto;padding:20px;border:1px solid #cbd5e1;border-radius:14px}.mach-dialog select,.mach-dialog input[type=text]{max-width:100%;padding:8px;margin:6px}.mach-panel h3{margin:20px 0 8px}.mach-dialog::backdrop{background:#15243a80}#mach-selected-preview .paper-page{transform-origin:top left;zoom:.4}#mach-selected-preview{overflow:auto;max-height:55vh}@media(max-width:600px){.mach-panel{margin:12px;padding:14px}.mach-actions .btn{white-space:normal;height:auto;min-height:40px}.mach-dialog{padding:14px}}`;
  document.head.append(style); document.querySelector('header').after(panel);
  const $ = id => panel.querySelector('#' + id);
  const dialog = document.createElement('dialog'); dialog.className = 'mach-dialog'; dialog.id = 'mach-change-dialog'; document.body.append(dialog);
  const previewDialog = document.createElement('dialog'); previewDialog.className = 'mach-dialog'; previewDialog.innerHTML = '<h2>선택 명패 미리보기</h2><p>각 페이지의 앞·뒷면 한 쌍을 유지합니다.</p><div id="mach-selected-preview"></div><button class="btn">닫기</button>'; document.body.append(previewDialog); previewDialog.querySelector('button').onclick = () => previewDialog.close();
  let selected = new Set(), pending = null, printing = false, lastSource = 'prime';
  const error = e => adapter.showStatus(e.message || '작업을 완료하지 못했습니다.');
  const getProject = () => M.clone(state);
  function commit(next) {
    if (adapter.blocked()) throw Error('손상된 원본 보호 중입니다. 유효한 작업 파일을 먼저 불러오세요.');
    M.validateProject(next);
    const raw = Mach.atomicSave(localStorage, adapter.storageKey, adapter.getRaw(), next, adapter.storageKey + ':before-mach');
    Object.assign(state, next); adapter.setRaw(raw); adapter.renderAll();
  }
  function rendered(person) { return M.renderValue(state, person, { logo: adapter.getLeftLogoInfo(person).src, footer: adapter.footerInfo().src, template: adapter.getTemplateInfo().src }); }
  function rowStatus(person) { return M.status(state, person, rendered(person)); }
  const eligible = p => M.active(p) && (!$('mach-changed-only').checked || rowStatus(p) !== '변경 없음');
  const chosen = () => state.people.filter(p => eligible(p) && selected.has(p.id));
  function refresh() {
    if (!state.mach || adapter.blocked()) { $('mach-event-label').textContent = '원본 보호 중 · 유효한 작업 파일을 불러오세요.'; return; }
    $('mach-event-label').textContent = state.mach.eventId ? `연결 행사: ${state.mach.eventName || state.mach.eventId} · 활성 명패 ${state.people.filter(M.active).length}명` : '단독 작업 · 연동 명단을 받으면 대상 행사를 확인합니다.';
    selected = new Set(state.people.filter(p => eligible(p) && selected.has(p.id)).map(p => p.id));
    const list = $('mach-print-list'); list.replaceChildren();
    for (const person of state.people) {
      const status = rowStatus(person);
      if (!M.active(person) || ($('mach-changed-only').checked && status === '변경 없음')) continue;
      const row = document.createElement('div'); row.className = 'mach-row';
      const check = document.createElement('input'); check.type = 'checkbox'; check.checked = selected.has(person.id); check.dataset.participantId = person.id;
      check.onchange = () => { if (check.checked) selected.add(person.id); else selected.delete(person.id); };
      const label = document.createElement('label'); label.append(check, document.createTextNode(` ${person.name || '이름 없음'} · ${status}`)); row.append(label); list.append(row);
    }
    if (!list.children.length) list.textContent = '현재 필터의 출력 대상이 없습니다.';
    const jobs = $('mach-jobs'); jobs.replaceChildren();
    for (const job of [...state.mach.printJobs].reverse()) {
      const row = document.createElement('div'); row.className = 'mach-row';
      const label = document.createElement('span'); label.textContent = `${new Date(job.createdAt).toLocaleString('ko-KR')} · ${job.entries.length}명 · ${job.status === 'confirmed' ? '출력 완료 확인' : '출력 여부 미확인'} `; row.append(label);
      if (job.status !== 'confirmed') {
        const button = document.createElement('button'); button.className = 'btn'; button.textContent = '이 작업 출력 완료 확인'; button.dataset.jobId = job.id;
        button.onclick = () => { if (!confirm('이 작업에 고정된 내용의 실물 명패를 출력했습니까? 이후 수정한 최신 내용은 완료 처리되지 않습니다.')) return; try { commit(M.complete(state, job.id, new Date().toISOString())); adapter.showStatus('해당 출력 작업의 고정된 내용만 완료 확인했습니다.'); } catch (e) { error(e); } }; row.append(button);
      }
      const details = document.createElement('details'); const summary = document.createElement('summary'); summary.textContent = '이 작업에 고정된 출력 내용'; details.append(summary);
      for (const entry of job.entries) { const text = document.createElement('p'); text.textContent = `${entry.render.name} · ${entry.render.title}`; details.append(text); } row.append(details);
      jobs.append(row);
    }
    if (!jobs.children.length) jobs.textContent = '출력 작업이 없습니다.';
    const recalls = $('mach-recalls'); recalls.replaceChildren();
    for (const [id, record] of Object.entries(state.mach.recalls)) {
      const row = document.createElement('div'); row.className = 'mach-row'; const label = document.createElement('span'); label.textContent = `${record.name || id} · ${record.status === 'collected' ? '회수·폐기 확인' : '기존 명패 회수 필요'} `; row.append(label);
      if (record.status !== 'collected') { const button = document.createElement('button'); button.className = 'btn'; button.textContent = '회수·폐기 확인'; button.onclick = () => { if (!confirm('기존 명패를 회수 또는 폐기했습니까?')) return; try { const next = getProject(); next.mach.recalls[id].status = 'collected'; next.mach.recalls[id].confirmedAt = new Date().toISOString(); commit(next); } catch (e) { error(e); } }; row.append(button); }
      recalls.append(row);
    }
    if (!recalls.children.length) recalls.textContent = '회수 대상이 없습니다.';
  }
  function review(packet, respond = () => {}, sourceApp = 'prime') {
    Mach.validateTransfer(packet);
    if (packet.kind !== 'roster' && packet.kind !== 'seats') throw Error('참석자 명단 파일을 선택해 주세요.');
    if (adapter.blocked() || !state.mach) throw Error('원본 보호 중입니다. 유효한 작업을 먼저 복원하세요.');
    const rows = M.review(state, packet);
    const prior = state.mach.applied[packet.transferId];
    if (prior) { respond({ status: prior.pendingIds.length ? 'pending' : 'applied', appliedIds: prior.selectedIds, pendingIds: prior.pendingIds }); if (!prior.pendingIds.length) return; }
    if (pending) throw Error('먼저 열려 있는 변경 확인을 완료하거나 취소하세요.');
    lastSource = sourceApp;
    pending = { packet: M.clone(packet), respond, sourceApp, original: adapter.getRaw(), rows };
    dialog.replaceChildren();
    const title = document.createElement('h2'); title.textContent = '명패 변경분 확인'; dialog.append(title);
    const summary = document.createElement('p'); summary.textContent = `받을 행사: ${packet.eventName || packet.eventId} · 현재: ${state.mach.eventName || (state.mach.eventId ? '연결 행사' : '단독 작업')} · 변경 ${rows.length}명. 기존 디자인·로고와 무관한 명단은 유지합니다. 빠진 사람은 삭제하지 않습니다.`; dialog.append(summary);
    if (!state.mach.eventId) { const intro = document.createElement('p'); intro.textContent = '처음 연결하는 행사입니다. 이름이 같아도 식별자가 다른 기존 명패는 자동 합치지 않습니다. 선택 항목 반영으로 이 행사와 연결됩니다.'; dialog.append(intro); }
    const all = document.createElement('button'); all.className = 'btn'; all.textContent = '전체 선택'; all.id = 'mach-review-all'; all.onclick = () => dialog.querySelectorAll('[data-select-id]').forEach(check => check.checked = true); dialog.append(all);
    const labels = { name: '이름', organization: '소속 표시', position: '직책 표시', status: '참석 상태', seatId: '자리', replacesParticipantId: '대리참석 관계' };
    const display = (field, value) => field === 'status' ? ({attending:'참석',absent:'불참',replaced:'대리로 교체'}[value] || '없음') : field === 'replacesParticipantId' && value ? (state.people.find(p => p.id === value)?.name || packet.participants.find(p => p.participantId === value)?.name || '원 참석자 확인 필요') : value || '없음';
    for (const item of rows) {
      const row = document.createElement('div'); row.className = 'mach-row'; const check = document.createElement('input'); check.type = 'checkbox'; check.dataset.selectId = item.id; check.checked = !item.conflicts.length;
      const heading = document.createElement('label'); heading.append(check, document.createTextNode(` ${item.incoming.name || '이름 없음'} · ${item.kind}${item.conflicts.length ? ' · 별도 표시 확인 필요' : ''}`)); row.append(heading);
      for (const field of item.changes) {
        const line = document.createElement('p'); line.textContent = `${labels[field]}: ${display(field, item.baseline?.[field])} → ${display(field, item.incoming[field])}${item.current && item.current[field] !== item.baseline?.[field] ? ` · 현재 표시: ${display(field, item.current[field])}` : ''}`; row.append(line);
        if (item.conflicts.includes(field)) {
          const select = document.createElement('select'); select.dataset.fieldId = item.id; select.dataset.field = field; select.setAttribute('aria-label', `${item.incoming.name} ${labels[field]} 처리`);
          for (const [value, text] of [['', '처리 방법 선택'], ['incoming', '받은 내용 적용'], ['local', '현재 별도 표시 유지'], ['manual', '직접 정정']]) { const option = document.createElement('option'); option.value = value; option.textContent = text; select.append(option); }
          const input = document.createElement('input'); input.type = 'text'; input.maxLength = 500; input.value = item.current[field] || ''; input.hidden = true; input.setAttribute('aria-label', `${labels[field]} 직접 정정`); select.onchange = () => input.hidden = select.value !== 'manual'; row.append(select, input);
        }
      }
      const impact = document.createElement('p'); impact.textContent = !M.active(item.incoming) ? '새 출력 대상에서 제외 · 확인된 기존 명패는 회수 목록에 보존' : item.kind === '자리 변경' ? '좌석번호를 인쇄하지 않으므로 자리만 바뀌면 재출력하지 않습니다.' : '실제 출력 표시가 바뀌면 재출력 대상으로 표시합니다.'; row.append(impact); dialog.append(row);
    }
    const actions = document.createElement('div'); actions.className = 'mach-actions'; const cancel = document.createElement('button'); cancel.className = 'btn'; cancel.textContent = '취소 · 내용 유지'; cancel.onclick = cancelReview;
    const apply = document.createElement('button'); apply.className = 'btn primary'; apply.id = 'mach-review-apply'; apply.textContent = rows.length ? '선택한 변경 반영' : '변경 없음 확인'; apply.onclick = () => {
      try {
        if (adapter.getRaw() !== pending.original || localStorage.getItem(adapter.storageKey) !== pending.original) throw Error('확인 중 다른 변경이 생겼습니다. 취소 후 최신본으로 다시 비교해 주세요.');
        const choices = {};
        dialog.querySelectorAll('[data-select-id]').forEach(check => choices[check.dataset.selectId] = { selected: check.checked, fields: {} });
        dialog.querySelectorAll('[data-field-id]').forEach(select => choices[select.dataset.fieldId].fields[select.dataset.field] = { mode: select.value, value: select.nextElementSibling.value });
        if (rows.length && !Object.values(choices).some(c => c.selected)) throw Error('반영할 변경을 선택해 주세요.');
        const next = M.apply(state, pending.packet, choices); commit(next);
        const result = next.mach.applied[packet.transferId]; pending.respond({ status: result.pendingIds.length ? 'pending' : 'applied', appliedIds: result.selectedIds, pendingIds: result.pendingIds });
        const remains = result.pendingIds.length; pending = null; dialog.close(); adapter.showStatus(`선택 변경 반영 완료. ${remains ? `미선택 ${remains}명은 다시 보내거나 같은 파일을 다시 열어 확인하세요.` : '기존 디자인을 유지했습니다.'}`);
      } catch (e) { error(e); }
    }; actions.append(cancel, apply); dialog.append(actions); dialog.showModal(); respond({ status: 'pending', pendingIds: rows.map(r => r.id) });
  }
  function cancelReview() { if (pending) pending.respond({ status: 'cancelled', message: '담당자가 내용 유지 선택' }); pending = null; dialog.close(); }
  dialog.addEventListener('cancel', event => { event.preventDefault(); cancelReview(); });
  const bridge = Mach.createBridge({ app: 'nameplate', onTransfer(packet, respond, meta) { try { review(packet, respond, meta.sourceApp); } catch (e) { respond({ status: 'conflict', message: e.message }); error(e); } }, onStatus(info) { $('mach-link-status').textContent = info.message || ({preparing:'전달 준비', received:'상대 도구 수신 확인', pending:'상대 도구 반영 대기', applied:'상대 도구 반영 완료', cancelled:'내용 유지', conflict:'최신본 확인 필요', unknown:'반영 여부 확인 필요'}[info.status] || '연결 확인'); } });
  function printRecords() {
    if (!state.mach.eventId) throw Error('행사 연결 후 출력 상태를 전달할 수 있습니다.');
    const records = [];
    for (const person of state.people) {
      if (!state.mach.baselines[person.id]) continue;
      const snapshot = state.mach.confirmed[person.id], status = rowStatus(person), recall = state.mach.recalls[person.id];
      records.push({ participantId: person.id, jobId: snapshot?.jobId || 'unconfirmed', snapshotId: snapshot ? snapshot.jobId : `unconfirmed:${person.id}`, revision: snapshot?.revision ?? state.mach.revision, status: recall ? (recall.status === 'collected' ? 'recalled' : 'recall') : ({ '변경 없음': 'printed', '수정 재출력 필요': 'changed', '신규 출력 필요': 'new', '출력 여부 미확인': 'unknown' }[status] || 'unknown'), receivedFingerprint: state.mach.baselines[person.id] ? Mach.personFingerprint(state.mach.baselines[person.id]) : '', sourceFingerprint: snapshot ? (snapshot.sourceFingerprint || '') : (state.mach.baselines[person.id] ? Mach.personFingerprint(state.mach.baselines[person.id]) : ''), fingerprint: snapshot ? String(snapshot.signature.length) + ':' + [...snapshot.signature].reduce((h, c) => Math.imul(h ^ c.charCodeAt(0), 16777619) >>> 0, 2166136261).toString(16) : '' });
    }
    return Mach.createTransfer({ kind: 'print', eventId: state.mach.eventId, eventName: state.mach.eventName || '', revision: state.mach.revision, baseRevision: state.mach.revision, records });
  }
  $('mach-print-report').onclick = async () => { try { await bridge.send(lastSource, printRecords()); } catch (e) { error(e); } };
  $('mach-print-export').onclick = () => { try { Mach.exportFile(printRecords(), '명패-출력상태.json'); } catch (e) { error(e); } };
  $('mach-import').onclick = () => $('mach-file').click(); $('mach-file').onchange = async () => { try { if ($('mach-file').files[0]) review(await Mach.readFile($('mach-file').files[0])); } catch (e) { error(e); } finally { $('mach-file').value = ''; } };
  $('mach-changed-only').onchange = () => { selected.clear(); refresh(); };
  $('mach-select-all').onclick = () => { panel.querySelectorAll('#mach-print-list input[type=checkbox]').forEach(check => { check.checked = true; selected.add(check.dataset.participantId); }); };
  $('mach-backup').onclick = () => { const raw = localStorage.getItem(adapter.storageKey + ':before-mach'); if (!raw) return adapter.showStatus('변경 전 백업이 없습니다.'); adapter.downloadText('명패-변경전-복원본.json', raw); };
  $('mach-undo').onclick = () => { try { const raw = localStorage.getItem(adapter.storageKey + ':before-mach'); if (!raw) throw Error('복원본이 없습니다.'); if (!confirm('직전 작업 이전 상태로 이 명패 앱만 복원합니다. 다른 도구의 반영은 되돌리지 않으며 다시 전달·확인이 필요합니다. 계속할까요?')) return; const previous = JSON.parse(raw); M.validateProject(previous); previous.mach = M.metadata(previous.mach, adapter.newId()); commit(previous); bridge.invalidateResults(); adapter.showStatus('이 명패 작업만 복원했습니다. 다른 도구에는 다시 전달·확인하세요.'); } catch (e) { error(e); } };
  function buildPages(people, host) { host.replaceChildren(...people.map(p => adapter.createPage(p, state.people.findIndex(x => x.id === p.id), true))); adapter.fitText(host); }
  $('mach-preview').onclick = () => { if (!chosen().length) return adapter.showStatus('명패를 선택해 주세요.'); buildPages(chosen(), previewDialog.querySelector('#mach-selected-preview')); previewDialog.showModal(); };
  async function print(mode, baseline = false) {
    if (printing) return;
    const people = (mode === 'current' ? [state.people[state.selectedIndex]] : mode === 'all' ? state.people : chosen()).filter(p => p && M.active(p));
    if (!people.length) return adapter.showStatus('출력할 활성 명패를 선택해 주세요.');
    printing = true;
    try {
      if (adapter.blocked()) throw Error('원본 보호 중입니다. 유효한 작업을 먼저 복원하세요.');
      const source = adapter.getRaw();
      adapter.applyCssVariables(); buildPages(people, adapter.printStage);
      document.body.classList.remove('print-current');
      await document.fonts.ready;
      await Promise.all([...adapter.printStage.querySelectorAll('img')].map(img => img.decode().catch(() => { throw Error('로고 또는 배경 이미지를 읽지 못해 출력을 중지했습니다.'); })));
      if (adapter.getRaw() !== source) throw Error('출력 준비 중 내용이 바뀌었습니다. 다시 출력해 주세요.');
      const issues = adapter.fitText(adapter.printStage);
      if (issues.length) throw Error('선택 명패의 글자가 출력 영역을 초과합니다. 글자 크기·표시 내용을 조절하세요.');
      const entries = people.map((person, index) => ({ participantId: person.id, render: rendered(person), sourceFingerprint: state.mach.baselines[person.id] ? Mach.personFingerprint(state.mach.baselines[person.id]) : '', html: adapter.printStage.children[index].outerHTML, cssVariables: document.documentElement.style.cssText }));
      const job = M.createJob(state, entries, adapter.newId(), new Date().toISOString());
      const next = getProject(); next.mach.printJobs.push(job); commit(next);
      if (baseline) { commit(M.complete(state, job.id, new Date().toISOString())); adapter.showStatus('선택한 현재 표시를 실물 출력 기준본으로 지정했습니다.'); return; }
      // commit renders the editor; rebuild from immutable DOM strings captured above.
      const pages = job.entries.map(entry => { const template = document.createElement('template'); template.innerHTML = entry.html; const page = template.content.firstElementChild; page.style.cssText += entry.cssVariables; return page; });
      adapter.printStage.replaceChildren(...pages);
      document.body.classList.toggle('print-current', mode === 'current');
      await new Promise(resolve => requestAnimationFrame(resolve));
      // A user edit during the frame must not replace this job's frozen output.
      adapter.printStage.replaceChildren(...pages);
      document.body.classList.toggle('print-current', mode === 'current');
      window.print(); adapter.showStatus('출력 작업을 보관했습니다. 실물 출력 후 해당 작업의 완료를 확인하세요.');
    } catch (e) { error(e); adapter.renderAll(); } finally { printing = false; refresh(); }
  }
  $('mach-print-selected').onclick = () => print('selected');
  $('mach-set-baseline').onclick = () => { if (confirm('선택한 현재 표시·디자인과 같은 실물 명패가 이미 출력되어 있습니까? 확인한 명패만 출력 기준본으로 지정합니다.')) print('selected', true); };
  window.addEventListener('afterprint', () => { adapter.renderAll(); });
  return { refresh, print, invalidate: () => bridge.invalidateResults() };
}
