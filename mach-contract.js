/* MACH explicit window/file handoff, contract 1. No participant data in URLs. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.Mach = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const VERSION = 1;
  const LIMIT = 2 * 1024 * 1024;
  const APPS = ['oneq', 'prime', 'nameplate'];
  const PATHS = { oneq: '/erica-event-oneq/', prime: '/erica-seat-planner/', nameplate: '/nameplate-maker/' };
  const STATUSES = ['pending', 'applied', 'cancelled', 'conflict', 'unknown'];
  const plain = value => value && typeof value === 'object' && !Array.isArray(value) && [Object.prototype, null].includes(Object.getPrototypeOf(value));
  const text = (value, max = 500) => typeof value === 'string' && value.length <= max;
  const identifier = value => text(value, 160) && !['constructor', 'prototype', '__proto__'].includes(value) && /^[A-Za-z0-9][A-Za-z0-9_.:-]*$/.test(value);
  const revision = value => Number.isSafeInteger(value) && value >= 0;
  const copy = value => JSON.parse(JSON.stringify(value));
  function id() { return globalThis.crypto.randomUUID(); }
  function safeTree(value, depth = 0, budget = { nodes: 0, characters: 0 }) {
    budget.nodes++;
    if (typeof value === 'string') budget.characters += value.length;
    if (budget.nodes > 40000 || budget.characters > LIMIT) throw new Error('자료가 너무 큽니다.');
    if (depth > 15) throw new Error('자료 구조가 너무 깊습니다.');
    if (value === null || ['string', 'boolean'].includes(typeof value)) return;
    if (typeof value === 'number' && Number.isFinite(value)) return;
    if (Array.isArray(value)) { if (value.length > 10000) throw new Error('자료가 너무 큽니다.'); value.forEach(item => safeTree(item, depth + 1, budget)); return; }
    if (!plain(value)) throw new Error('지원하지 않는 자료 구조입니다.');
    for (const key of Object.keys(value)) {
      if (['__proto__', 'prototype', 'constructor'].includes(key)) throw new Error('허용하지 않는 자료 구조입니다.');
      budget.characters += key.length;
      safeTree(value[key], depth + 1, budget);
    }
  }
  function validateTransfer(payload) {
    safeTree(payload);
    if (JSON.stringify(payload).length > LIMIT || !plain(payload) || payload.schemaVersion !== VERSION ||
      !['roster', 'seats', 'print'].includes(payload.kind) || !identifier(payload.eventId) || !identifier(payload.transferId) ||
      !text(payload.eventName || '', 500) || !revision(payload.revision) || !revision(payload.baseRevision) || payload.baseRevision > payload.revision) {
      throw new Error('행사·자료 형식 또는 기준본 정보가 올바르지 않습니다.');
    }
    const allowed = ['schemaVersion', 'kind', 'eventId', 'eventName', 'revision', 'baseRevision', 'transferId', 'participants', 'records'];
    if (Object.keys(payload).some(key => !allowed.includes(key))) throw new Error('지원하지 않는 전달 항목입니다.');
    if (payload.kind !== 'print') {
      if (!Array.isArray(payload.participants) || payload.participants.length > 300 || payload.records !== undefined) throw new Error('참석자 수 또는 자료 형식을 확인해 주세요.');
      const ids = new Set();
      for (const p of payload.participants) {
        if (!plain(p) || !identifier(p.participantId) || ids.has(p.participantId) ||
          !['name', 'organization', 'position'].every(key => text(p[key])) ||
          !['attending', 'absent', 'replaced'].includes(p.status) ||
          (p.replacesParticipantId !== undefined && p.replacesParticipantId !== '' && !identifier(p.replacesParticipantId)) ||
          (p.seatId !== undefined && !text(p.seatId, 120)) || (p.seatLocked !== undefined && typeof p.seatLocked !== 'boolean') ||
          Object.keys(p).some(key => !['participantId', 'name', 'organization', 'position', 'status', 'replacesParticipantId', 'seatId', 'seatLocked'].includes(key))) {
          throw new Error('중복 ID 또는 올바르지 않은 참석자 자료입니다.');
        }
        if (p.replacesParticipantId === p.participantId) throw new Error('자신을 대리참석자로 지정할 수 없습니다.');
        ids.add(p.participantId);
      }
    } else {
      if (!Array.isArray(payload.records) || payload.records.length > 1000 || payload.participants !== undefined) throw new Error('출력 확인 자료 형식이 올바르지 않습니다.');
      const ids = new Set();
      for (const r of payload.records) {
        const key = `${r?.participantId}:${r?.jobId}:${r?.snapshotId}`;
        if (!plain(r) || !identifier(r.participantId) || !identifier(r.jobId) || !identifier(r.snapshotId) || !revision(r.revision) ||
          !['printed', 'recall', 'recalled', 'unknown', 'changed', 'new'].includes(r.status) ||
          (r.fingerprint !== undefined && !text(r.fingerprint, 200000)) || (r.sourceFingerprint !== undefined && !text(r.sourceFingerprint, 4000)) || (r.receivedFingerprint !== undefined && !text(r.receivedFingerprint, 4000)) || ids.has(key) ||
          Object.keys(r).some(k => !['participantId', 'jobId', 'snapshotId', 'revision', 'status', 'fingerprint', 'sourceFingerprint', 'receivedFingerprint'].includes(k))) throw new Error('출력 확인본을 확인해 주세요.');
        ids.add(key);
      }
    }
    return payload;
  }
  const personFingerprint = p => JSON.stringify([p.participantId, p.name, p.organization, p.position, p.status, p.replacesParticipantId || '']);
  function createTransfer(input) { const payload = { schemaVersion: VERSION, transferId: id(), ...copy(input) }; return validateTransfer(payload); }
  const comparable = v => typeof v === 'string' ? v.trim().replace(/\s+/g, ' ') : v;
  function threeWay(base, local, incoming, fields = ['name', 'organization', 'position', 'status']) {
    const changes = [], conflicts = [];
    for (const field of fields) {
      const before = base?.[field], current = local?.[field], after = incoming?.[field];
      if (comparable(after) === comparable(before) || comparable(after) === comparable(current)) continue;
      const conflict = !!local && comparable(current) !== comparable(before);
      changes.push({ field, before, current, after, conflict });
      if (conflict) conflicts.push(field);
    }
    return { changes, conflicts };
  }
  function atomicSave(storage, key, expectedRaw, nextValue, backupKey = key + ':before-mach') {
    if (storage.getItem(key) !== expectedRaw) throw new Error('다른 창에서 최신 내용을 저장했습니다. 최신본 확인이 필요합니다.');
    const next = JSON.stringify(nextValue);
    if (expectedRaw !== null) storage.setItem(backupKey, expectedRaw);
    // A synchronous storage write is atomic. In-memory state must change only after this succeeds.
    storage.setItem(key, next);
    return next;
  }
  function exportFile(payload, filename = 'mach-transfer.json') {
    validateTransfer(payload);
    const url = URL.createObjectURL(new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' }));
    const a = document.createElement('a'); a.href = url; a.download = filename; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  async function readFile(file) {
    if (!file || file.size > LIMIT) throw new Error('연동 파일은 2MB 이하여야 합니다.');
    return validateTransfer(JSON.parse(await file.text()));
  }
  function validateResult(result) {
    try { safeTree(result); } catch { return false; }
    if (!plain(result) || !STATUSES.includes(result.status) || (result.message !== undefined && !text(result.message, 1000))) return false;
    return ['appliedIds', 'pendingIds'].every(k => result[k] === undefined || (Array.isArray(result[k]) && result[k].length <= 1000 && result[k].every(identifier)));
  }
  function createBridge(options) {
    const win = options.window || window;
    const app = options.app;
    if (!APPS.includes(app)) throw new Error('Unknown app');
    const local = ['localhost', '127.0.0.1'].includes(win.location.hostname);
    const origin = local ? win.location.origin : 'https://erakeun.github.io';
    const connections = new Map(), outstanding = new Map(), received = new Map();
    const timers = new Set();
    const emit = (targetApp, transferId, status, message, result) => options.onStatus?.({ targetApp, transferId, status, ...(message ? { message } : {}), ...(result ? { result: copy(result) } : {}) });
    const interval = (fn, delay) => { const timer = win.setInterval(fn, delay); timers.add(timer); return timer; };
    const stop = timer => { win.clearInterval(timer); timers.delete(timer); };
    const envelope = (connection, type, extra = {}) => ({ channel: 'mach-explicit-handoff', schemaVersion: VERSION, type, session: connection.session, from: app, to: connection.app, ...extra });
    const post = (connection, type, extra) => connection.window.postMessage(envelope(connection, type, extra), origin);
    // Only a random session capability and app identifier are used in the fragment.
    const fragment = new URLSearchParams(win.location.hash.replace(/^#/, ''));
    const initialSession = fragment.get('mach-session');
    const parentApp = fragment.get('mach-from');
    if (initialSession && identifier(initialSession) && APPS.includes(parentApp) && parentApp !== app && win.opener) {
      connections.set(parentApp, { app: parentApp, window: win.opener, session: initialSession, ready: false, eventId: null });
      fragment.delete('mach-session'); fragment.delete('mach-from');
      win.history.replaceState(null, '', win.location.pathname + win.location.search + (fragment.size ? '#' + fragment : ''));
    }
    function finishPending(key, result) {
      const pending = outstanding.get(key);
      if (!pending) return;
      pending.lastResult = copy(result);
      emit(pending.targetApp, pending.payload.transferId, result.status, result.message, result);
      if (result.status !== 'pending') { stop(pending.timer); pending.resolve(copy(result)); }
    }
    const routes = { oneq: { prime: ['roster'], nameplate: ['roster'] }, prime: { oneq: ['seats', 'print'], nameplate: ['roster'] }, nameplate: { prime: ['print'], oneq: ['print'] } };
    function onMessage(event) {
      const data = event.data;
      if (event.origin !== origin || !plain(data) || data.channel !== 'mach-explicit-handoff' || data.schemaVersion !== VERSION ||
        data.to !== app || !APPS.includes(data.from) || !identifier(data.session)) return;
      const c = connections.get(data.from);
      if (!c || event.source !== c.window || data.session !== c.session) return;
      if (data.type === 'hello') { c.ready = true; post(c, 'ready'); return; }
      if (data.type === 'ready') { c.ready = true; return; }
      if (!c.ready) return;
      if (data.type === 'transfer') {
        let payload;
        try { payload = validateTransfer(data.payload); } catch { return; }
        if (!routes[data.from]?.[app]?.includes(payload.kind)) return;
        if (c.eventId && c.eventId !== payload.eventId) {
          post(c, 'result', { eventId: payload.eventId, transferId: payload.transferId, result: { status: 'conflict', message: '다른 행사입니다. 새 연결과 확인이 필요합니다.' } }); return;
        }
        c.eventId = payload.eventId;
        const key = c.session + ':' + payload.transferId;
        const previous = received.get(key);
        if (previous) {
          if (previous.json !== JSON.stringify(payload)) return;
          post(c, 'result', { eventId: payload.eventId, transferId: payload.transferId, result: previous.result }); return;
        }
        const entry = { json: JSON.stringify(payload), result: { status: 'pending' } };
        received.set(key, entry);
        post(c, 'received', { eventId: payload.eventId, transferId: payload.transferId });
        const respond = result => {
          if (!validateResult(result)) throw new Error('Invalid handoff result');
          entry.result = copy(result);
          post(c, 'result', { eventId: payload.eventId, transferId: payload.transferId, result: entry.result });
        };
        try {
          const promise = options.onTransfer?.(copy(payload), respond, { sourceApp: c.app });
          Promise.resolve(promise).catch(() => respond({ status: 'conflict', message: '자료를 반영하지 못했습니다. 현재 작업을 확인해 주세요.' }));
        } catch { respond({ status: 'conflict', message: '자료를 반영하지 못했습니다. 현재 작업을 확인해 주세요.' }); }
      } else if (data.type === 'received' || data.type === 'result') {
        const key = c.app + ':' + data.transferId;
        const pending = outstanding.get(key);
        if (!pending || data.eventId !== pending.payload.eventId) return;
        if (data.type === 'received') { pending.received = true; emit(c.app, data.transferId, 'received'); }
        else if (validateResult(data.result)) finishPending(key, data.result);
      }
    }
    win.addEventListener('message', onMessage);
    function startSend(targetApp, raw, reuse) {
      const payload = copy(validateTransfer(raw));
      if (!routes[app]?.[targetApp]?.includes(payload.kind)) throw new Error('지원하지 않는 전달 방향입니다.');
      const key = targetApp + ':' + payload.transferId;
      let c = connections.get(targetApp);
      if (!c || c.window.closed) {
        const session = id();
        const child = win.open(`${origin}${PATHS[targetApp]}#mach-session=${session}&mach-from=${app}`, '_blank');
        if (!child) { emit(targetApp, payload.transferId, 'unknown', '팝업이 차단되었습니다. 팝업 허용 후 재시도하거나 연동 파일을 사용하세요.'); return Promise.resolve({ status: 'unknown' }); }
        c = { app: targetApp, window: child, session, ready: false, eventId: payload.eventId };
        connections.set(targetApp, c);
      }
      if (c.eventId && c.eventId !== payload.eventId) { emit(targetApp, payload.transferId, 'conflict', '다른 행사입니다. 상대 창을 닫고 새로 연결해 주세요.'); return Promise.resolve({ status: 'conflict' }); }
      c.eventId = payload.eventId;
      const old = outstanding.get(key);
      if (old && JSON.stringify(old.payload) !== JSON.stringify(payload)) throw new Error('같은 전달 ID에 다른 내용을 사용할 수 없습니다.');
      if (old && !reuse) return old.promise;
      if (old) stop(old.timer);
      const pending = { targetApp, payload, started: Date.now(), received: false, sent: false };
      pending.promise = new Promise(resolve => { pending.resolve = resolve; });
      outstanding.set(key, pending);
      emit(targetApp, payload.transferId, 'preparing');
      function tick() {
        if (c.window.closed || Date.now() - pending.started > (options.timeoutMs || 20000)) {
          finishPending(key, { status: 'unknown', message: '반영 여부 확인 필요: 상대 창에서 결과를 확인하거나 같은 보낸 내용을 재확인하세요.' }); return;
        }
        if (!c.ready) post(c, 'hello');
        else if (!pending.received) { post(c, 'transfer', { payload }); pending.sent = true; }
      }
      pending.timer = interval(tick, 500); tick();
      return pending.promise;
    }
    return {
      send: (target, payload) => startSend(target, payload, false),
      retry(target, transferId) { const previous = outstanding.get(target + ':' + transferId); if (!previous) throw new Error('보낸 내용이 없습니다.'); return startSend(target, previous.payload, true); },
      invalidateResults() { received.clear(); },
      close() { for (const timer of timers) win.clearInterval(timer); timers.clear(); win.removeEventListener('message', onMessage); connections.clear(); }
    };
  }
  return Object.freeze({ VERSION, LIMIT, id, personFingerprint, validateTransfer, createTransfer, threeWay, atomicSave, exportFile, readFile, createBridge });
});
