/* Nameplate-owned display and print history. No network or storage side effects. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.NameplateChanges = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const clone = value => JSON.parse(JSON.stringify(value));
  const fields = ['name', 'organization', 'position', 'status', 'replacesParticipantId', 'seatId'];
  const comparable = value => typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : value;
  const same = (a,b) => comparable(a) === comparable(b);
  const active = p => !['absent', 'replaced', 'cancelled'].includes(p.status);
  const canonical = p => ({ participantId: p.participantId || p.id, name: p.name || '', organization: p.organization || '', position: p.position || '', status: p.status || 'attending', replacesParticipantId: p.replacesParticipantId || '', seatId: p.seatId || '' });
  function metadata(saved, id) {
    if (saved && saved.schemaVersion !== 1) throw Error('지원하지 않는 명패 작업 형식입니다. 원본을 보존했습니다.');
    const result = saved ? clone(saved) : { schemaVersion: 1, eventId: '', localEventId: id, revision: 0, baselines: {}, applied: {}, printJobs: [], confirmed: {}, recalls: {} };
    for (const key of ['baselines', 'applied', 'confirmed', 'recalls']) if (!result[key] || typeof result[key] !== 'object' || Array.isArray(result[key])) throw Error('잘못된 명패 이력입니다.');
    if (!Array.isArray(result.printJobs) || result.printJobs.length > 500 || !Number.isSafeInteger(result.revision) || result.revision < 0) throw Error('잘못된 출력 이력입니다.');
    const identifier = value => typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,159}$/.test(value);
    const snapshot = e => {
      if (!e || !identifier(e.participantId) || !e.render || typeof e.render !== 'object' || Array.isArray(e.render) || typeof e.signature !== 'string' || e.signature !== JSON.stringify(e.render)) throw Error('잘못된 출력 확인본입니다.');
      if (e.html !== undefined && (typeof e.html !== 'string' || e.html.length > 300000 || /<(script|iframe|object|embed)|\son[a-z]+\s*=|javascript:/i.test(e.html))) throw Error('안전하지 않은 출력 내용입니다.');
    };
    if (typeof result.eventId !== 'string' || (result.eventId && !identifier(result.eventId))) throw Error('잘못된 행사 식별자입니다.');
    for (const [id, p] of Object.entries(result.baselines)) if (!identifier(id) || !p || p.participantId !== id || ['name','organization','position'].some(f => typeof p[f] !== 'string') || !['attending','absent','replaced'].includes(p.status)) throw Error('잘못된 기준 명단입니다.');
    const jobs = new Set();
    for (const job of result.printJobs) {
      if (!job || !identifier(job.id) || jobs.has(job.id) || !identifier(job.eventId) || !Number.isSafeInteger(job.revision) || job.revision < 0 || !['unconfirmed','confirmed'].includes(job.status) || typeof job.createdAt !== 'string' || !Array.isArray(job.entries) || !job.entries.length || job.entries.length > 2000) throw Error('잘못된 출력 작업입니다.');
      jobs.add(job.id); const ids = new Set();
      job.entries.forEach(e => { snapshot(e); if(ids.has(e.participantId)) throw Error('중복 출력 대상입니다.'); ids.add(e.participantId); });
    }
    for (const [id, e] of Object.entries(result.confirmed)) { snapshot(e); if (id !== e.participantId || !identifier(e.jobId) || !jobs.has(e.jobId) || !Number.isSafeInteger(e.revision)) throw Error('잘못된 출력 확인 이력입니다.'); }
    for (const [id, r] of Object.entries(result.recalls)) if (!identifier(id) || !r || r.participantId !== id || !['pending','collected'].includes(r.status) || typeof r.name !== 'string' || !r.snapshot) throw Error('잘못된 회수 이력입니다.');
    for (const [id, r] of Object.entries(result.applied)) if (!identifier(id) || !r || typeof r.payloadFingerprint !== 'string' || r.payloadFingerprint.length > 2 * 1024 * 1024 || !Array.isArray(r.selectedIds) || !Array.isArray(r.pendingIds) || [...r.selectedIds,...r.pendingIds].some(id => !identifier(id))) throw Error('잘못된 전달 이력입니다.');
    return result;
  }
  function review(project, packet) {
    const m = project.mach;
    if (m.applied[packet.transferId] && m.applied[packet.transferId].payloadFingerprint !== JSON.stringify(packet)) throw Error('같은 전달 번호의 내용이 달라졌습니다. 최신본을 새로 보내 주세요.');
    if (m.eventId && m.eventId !== packet.eventId) throw Error('다른 행사입니다. 현재 작업을 파일로 저장한 뒤 별도 작업으로 불러오세요.');
    if (packet.revision < m.revision) throw Error('오래된 명단입니다. 최신본을 다시 보내 주세요.');
    const rows = [];
    for (const incoming of packet.participants) {
      const next = canonical(incoming), current = project.people.find(p => p.id === next.participantId), base = m.baselines[next.participantId];
      const changes = fields.filter(f => !base || !same(base[f], next[f]));
      if (!current || changes.length) {
        const conflicts = current ? changes.filter(f => ['name', 'organization', 'position'].includes(f) && !same(current[f], base?.[f] ?? next[f]) && !same(current[f], next[f])) : [];
        rows.push({ id: next.participantId, incoming: next, current: current ? clone(current) : null, baseline: base ? clone(base) : null, changes, conflicts, kind: !current ? '추가' : !active(next) ? '불참·교체' : next.replacesParticipantId ? '대리참석' : changes.every(f => f === 'seatId') ? '자리 변경' : '정보 정정' });
      }
    }
    return rows;
  }
  function apply(project, packet, choices) {
    const rows = review(project, packet), next = clone(project);
    if (project.mach.applied[packet.transferId] && !project.mach.applied[packet.transferId].pendingIds.length) return next;
    const selected = rows.filter(row => choices[row.id]?.selected);
    for (const row of selected) {
      const choice = choices[row.id], unresolved = row.conflicts.filter(f => !['incoming', 'local', 'manual'].includes(choice.fields?.[f]?.mode));
      if (unresolved.length) throw Error('별도 표시의 충돌을 먼저 확인해 주세요.');
      let person = next.people.find(p => p.id === row.id);
      if (!person) { person = { id: row.id, name: '', organization: '', position: '', logoKey: 'default' }; next.people.push(person); }
      for (const field of row.changes) {
        const resolution = choice.fields?.[field];
        if (resolution?.mode === 'local') continue;
        const value = resolution?.mode === 'manual' ? resolution.value : row.incoming[field];
        if (typeof value !== 'string' || value.length > 500) throw Error('표시 내용은 500자 이내여야 합니다.');
        person[field] = value;
      }
      next.mach.baselines[row.id] = clone(row.incoming);
      // Retained or separately corrected display is intentionally still pending upstream.
      for (const field of row.conflicts) if (!same(person[field], row.incoming[field])) next.mach.baselines[row.id][field] = row.baseline?.[field] ?? '';
      if (!active(person) && next.mach.confirmed[row.id] && !next.mach.recalls[row.id]) next.mach.recalls[row.id] = { participantId: row.id, name: next.mach.confirmed[row.id].render.name, status: 'pending', snapshot: clone(next.mach.confirmed[row.id]) };
    }
    if (rows.length === 0) for (const p of packet.participants) next.mach.baselines[p.participantId] = canonical(p);
    if (selected.length || rows.length === 0) {
      next.mach.eventId = packet.eventId;
      next.mach.eventName = packet.eventName || packet.event?.name || '';
      next.mach.revision = Math.max(next.mach.revision, packet.revision);
      const pendingIds = review(next, packet).map(r => r.id);
      next.mach.applied[packet.transferId] = { payloadFingerprint: JSON.stringify(packet), selectedIds: [...new Set([...(next.mach.applied[packet.transferId]?.selectedIds || []), ...selected.filter(r => !pendingIds.includes(r.id)).map(r => r.id)])], pendingIds };
    }
    return next;
  }
  function renderValue(project, person, assets = {}) {
    const d = project.design, design = { ...d };
    // These settings affect editing/preview, never a printed page.
    for (const key of ['settingsLocked', 'autoScaleElements', 'platePreset', 'showPageLabel', 'defaultLeftLogo', 'footerLogo', 'templateStyle', 'titleSeparator']) delete design[key];
    const key = person.logoKey === 'default' || !person.logoKey ? d.defaultLeftLogo : person.logoKey;
    const logo = project.customLogos.find(l => l.id === key);
    return { name: person.name || '이름', title: [person.organization, person.position].filter(Boolean).join(d.titleSeparator === '__LINE_BREAK__' ? '\n' : d.titleSeparator || ' ') || '소속 및 직책', titleWhiteSpace: d.titleSeparator === '__LINE_BREAK__' ? 'pre-line' : 'normal', logo: logo?.dataUrl || assets.logo || key, footer: assets.footer || d.footerLogo, template: assets.template || d.templateStyle, design };
  }
  const signature = render => JSON.stringify(render);
  function status(project, person, render) {
    const confirmed = project.mach.confirmed[person.id];
    if (!active(person)) return confirmed && project.mach.recalls[person.id]?.status !== 'collected' ? '기존 명패 회수 필요' : '변경 없음';
    if (!confirmed) return project.mach.baselines[person.id] ? '신규 출력 필요' : '출력 여부 미확인';
    return confirmed.signature === signature(render) ? '변경 없음' : '수정 재출력 필요';
  }
  function createJob(project, entries, id, date) {
    if (!entries.length) throw Error('출력할 명패를 선택해 주세요.');
    if (project.mach.printJobs.length >= 500) throw Error('출력 이력이 500건입니다. 작업 파일을 저장한 뒤 새 작업을 시작해 주세요.');
    const job = { id, eventId: project.mach.eventId || project.mach.localEventId, revision: project.mach.revision, createdAt: date, status: 'unconfirmed', entries: clone(entries).map(e => ({ ...e, signature: signature(e.render) })) };
    return job;
  }
  function complete(project, jobId, date) {
    const next = clone(project), job = next.mach.printJobs.find(j => j.id === jobId);
    if (!job) throw Error('출력 작업을 찾지 못했습니다.');
    if (job.eventId !== (next.mach.eventId || next.mach.localEventId)) throw Error('다른 행사의 출력 작업입니다.');
    if (job.status === 'confirmed') return next;
    job.status = 'confirmed'; job.confirmedAt = date;
    for (const entry of job.entries) {
      const previous = next.mach.confirmed[entry.participantId];
      if (previous && previous.createdAt > job.createdAt) continue;
      next.mach.confirmed[entry.participantId] = { ...clone(entry), jobId, eventId: job.eventId, revision: job.revision, createdAt: job.createdAt, confirmedAt: date };
      const person = next.people.find(p => p.id === entry.participantId);
      if (!person || !active(person)) next.mach.recalls[entry.participantId] = { participantId: entry.participantId, name: entry.render.name, status: 'pending', snapshot: clone(next.mach.confirmed[entry.participantId]) };
    }
    return next;
  }
  function validateProject(value) {
    if (!value || !Array.isArray(value.people) || value.people.length > 2000 || (value.design !== undefined && (!value.design || typeof value.design !== 'object' || Array.isArray(value.design)))) throw Error('잘못된 작업 파일입니다.');
    const ids = new Set();
    for (const p of value.people) {
      if (!p || typeof p !== 'object' || ['name','organization','position'].some(k => p[k] !== undefined && (typeof p[k] !== 'string' || p[k].length > 500))) throw Error('잘못된 명단입니다.');
      if (p.id && (typeof p.id !== 'string' || ids.has(p.id))) throw Error('참석자 식별자가 중복되었습니다.');
      if (p.id) ids.add(p.id);
    }
    if (value.mach) metadata(value.mach);
    for (const logo of value.customLogos || []) {
      if (!logo || typeof logo.dataUrl !== 'string' || !/^data:image\/[a-z0-9.+-]+;base64,[A-Za-z0-9+/=\s]+$/i.test(logo.dataUrl) || logo.dataUrl.length > 9e6) throw Error('로고는 외부 주소 없이 저장된 이미지 파일이어야 합니다.');
      if (/^data:image\/[^;]*(?:svg|xml)/i.test(logo.dataUrl)) {
        let svg;
        try { svg = atob(logo.dataUrl.slice(logo.dataUrl.indexOf(',') + 1)); } catch (_) { throw Error('SVG 로고를 읽지 못했습니다.'); }
        if (!/<svg[\s>]/i.test(svg) || /<(?:script|foreignObject|iframe|object|embed|animate\w*|set)(?:[\s>\/])|\son[a-z]+\s*=|<!DOCTYPE|<!ENTITY|@import|\\|javascript:/i.test(svg)) throw Error('외부 실행 또는 참조가 있는 SVG 로고는 사용할 수 없습니다.');
        if ([...svg.matchAll(/url\(([^)]*)\)/gi)].some(match => !/^#[A-Za-z_][\w:.-]*$/.test(match[1].trim().replace(/^["']|["']$/g, '')))) throw Error('외부 CSS 참조가 있는 SVG 로고는 사용할 수 없습니다.');
        const references = [...svg.matchAll(/(?:^|[\s:])href\s*=\s*(["'])(.*?)\1/gi)];
        if (references.some(match => !/^(?:#[A-Za-z_][\w:.-]*|data:image\/(?:png|jpeg|gif|webp);base64,[A-Za-z0-9+/=\s]+)$/.test(match[2]))) throw Error('외부 참조가 있는 SVG 로고는 사용할 수 없습니다.');
        if (/(?:^|[\s:])href\s*=\s*[^"'\s]/i.test(svg)) throw Error('잘못된 SVG 참조입니다.');
      }
    }
    const raw = JSON.stringify(value);
    if (raw.length > 20e6 || /"(?:__proto__|constructor|prototype)"\s*:/.test(raw)) throw Error('지원하지 않는 자료 구조입니다.');
    return true;
  }
  return { clone, active, canonical, metadata, review, apply, renderValue, signature, status, createJob, complete, validateProject };
});
