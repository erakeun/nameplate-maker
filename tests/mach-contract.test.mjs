import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const folder = path.dirname(fileURLToPath(import.meta.url));
const modulePath = [path.join(folder, '../mach-contract.js'), path.join(folder, '../dist/mach-contract.js'), path.join(folder, 'mach-contract.js')].find(fs.existsSync);
vm.runInThisContext(fs.readFileSync(modulePath, 'utf8'));
const M = globalThis.Mach;
const participant = (id = 'synthetic-a') => ({ participantId: id, name: '가상참석자', organization: '가상기관', position: '가상직책', status: 'attending', replacesParticipantId: '', seatId: '', seatLocked: false });
const roster = () => M.createTransfer({ kind: 'roster', eventId: 'synthetic-event', eventName: '가상 검증 행사', revision: 1, baseRevision: 0, participants: [participant()] });

test('contract: published fixture matches this supported contract', () => {
  const fixture=path.join(folder,'fixtures/mach-roster-v1.json');
  if (fs.existsSync(fixture)) assert.equal(M.validateTransfer(JSON.parse(fs.readFileSync(fixture,'utf8'))).schemaVersion,1);
});
test('contract: fixture accepts homonyms with distinct IDs and preserves exact display', () => {
  const p = roster(); p.participants.push(participant('synthetic-b')); p.participants[0].organization = '  가상  기관  ';
  assert.equal(M.validateTransfer(p), p);
  assert.equal(p.participants[0].organization, '  가상  기관  ');
});
test('contract: rejects unsupported versions, duplicate IDs, invalid statuses, oversized and prototype payloads', () => {
  const cases = [p => p.schemaVersion = 9, p => p.participants.push(p.participants[0]), p => p.participants[0].status = 'deleted', p => p.participants[0].name = 'x'.repeat(501), p => p.revision = -1, p => p.baseRevision = 2, p => p.participants[0].replacesParticipantId = p.participants[0].participantId, p => p.participants[0].url = 'https://example.test/'];
  for (const change of cases) { const p = roster(); change(p); assert.throws(() => M.validateTransfer(p)); }
  assert.throws(() => M.validateTransfer(JSON.parse('{"__proto__":{"unsafe":true}}')));
});
test('contract: three-way comparison identifies local conflicts without mutating display', () => {
  const base = participant(), local = { ...base, position: '로컬 표시' }, incoming = { ...base, position: '새 직책' };
  assert.deepEqual(M.threeWay(base, local, incoming).conflicts, ['position']);
  assert.equal(local.position, '로컬 표시');
  assert.equal(M.threeWay(base, base, { ...base, name: ' 가상참석자 ' }).changes.length, 0);
});
test('contract: backup/save failure and stale tab preserve original main data', () => {
  for (const failKey of ['project:before-mach', 'project']) {
    const map = new Map([['project', '{"original":true}']]);
    const storage = { getItem: key => map.get(key) ?? null, setItem(key, value) { if (key === failKey) throw new Error('quota'); map.set(key, value); } };
    assert.throws(() => M.atomicSave(storage, 'project', map.get('project'), { next: true }));
    assert.equal(map.get('project'), '{"original":true}');
  }
  const storage = { getItem: () => 'newer', setItem() { assert.fail('must not write'); } };
  assert.throws(() => M.atomicSave(storage, 'project', 'older', {}), /최신/);
});

function fakePair({ dropResults = false } = {}) {
  const origin = 'https://erakeun.github.io';
  const parentHandlers = [], childHandlers = [], ticks = new Map(); let serial = 0;
  const make = handlers => ({ location: { hostname: 'erakeun.github.io', origin, hash: '', pathname: '/', search: '' }, history: { replaceState() {} }, closed: false,
    addEventListener(type, fn) { if (type === 'message') handlers.push(fn); }, removeEventListener() {},
    setInterval(fn) { const key = ++serial; ticks.set(key, fn); return key; }, clearInterval(key) { ticks.delete(key); } });
  const parent = make(parentHandlers), child = make(childHandlers);
  // postMessage is asynchronous in a real browser; queueMicrotask preserves that behavior.
  parent.postMessage = (data, target) => { assert.equal(target, origin); if (pair.dropResults && data.type === 'result') return; queueMicrotask(() => parentHandlers.forEach(fn => fn({ data, source: child, origin }))); };
  child.postMessage = (data, target) => { assert.equal(target, origin); queueMicrotask(() => childHandlers.forEach(fn => fn({ data, source: parent, origin }))); };
  let childBridge;
  parent.open = url => { const parsed = new URL(url); assert.equal(parsed.search, ''); assert.equal(parsed.href.includes('가상'), false); child.location.hash = parsed.hash; child.opener = parent; childBridge = M.createBridge({ app: 'prime', window: child, onTransfer: (...args) => pair.receive(...args) }); return child; };
  const pair = { dropResults, parent, child, parentHandlers, childHandlers, ticks, receive() {}, flush: async () => { await new Promise(resolve => setImmediate(resolve)); }, tick: async () => { [...ticks.values()].forEach(fn => fn()); await new Promise(resolve => setImmediate(resolve)); }, close: () => childBridge?.close() };
  return pair;
}
test('contract: real handshake semantics, preview only, durable app confirmation and duplicate transfer', async () => {
  const pair = fakePair(); let seen = 0, respond;
  pair.receive = (payload, callback) => { seen++; respond = callback; assert.equal(payload.eventId, 'synthetic-event'); };
  const statuses = [], bridge = M.createBridge({ app: 'oneq', window: pair.parent, onStatus: x => statuses.push(x.status) });
  const payload = roster(), pending = bridge.send('prime', payload);
  await pair.flush(); await pair.tick();
  assert.equal(seen, 1); assert.equal(statuses.includes('applied'), false);
  respond({ status: 'applied', appliedIds: ['synthetic-a'] });
  assert.equal((await pending).status, 'applied');
  const retry = bridge.retry('prime', payload.transferId); await pair.flush();
  assert.equal((await retry).status, 'applied'); assert.equal(seen, 1);
  bridge.close(); pair.close();
});
test('contract: wrong origin/source/session/version and unconnected window cannot deliver', async () => {
  const pair = fakePair(); let seen = 0; pair.receive = () => seen++;
  const bridge = M.createBridge({ app: 'oneq', window: pair.parent }); bridge.send('prime', roster());
  await pair.flush();
  const fragment = new URLSearchParams(pair.child.location.hash.slice(1));
  const good = { channel: 'mach-explicit-handoff', schemaVersion: 1, type: 'transfer', session: fragment.get('mach-session'), from: 'oneq', to: 'prime', payload: roster() };
  for (const event of [
    { origin: 'https://evil.invalid', source: pair.parent, data: good },
    { origin: pair.parent.location.origin, source: {}, data: good },
    { origin: pair.parent.location.origin, source: pair.parent, data: { ...good, session: 'past-session' } },
    { origin: pair.parent.location.origin, source: pair.parent, data: { ...good, schemaVersion: 2 } }
  ]) pair.childHandlers.forEach(fn => fn(event));
  assert.equal(seen, 0); bridge.close(); pair.close();
});
test('contract: popup block and closed window never report applied', async () => {
  const pair = fakePair(); pair.parent.open = () => null;
  const bridge = M.createBridge({ app: 'oneq', window: pair.parent });
  assert.equal((await bridge.send('prime', roster())).status, 'unknown'); bridge.close();
  const p = fakePair(), b = M.createBridge({ app: 'oneq', window: p.parent });
  const result = b.send('prime', roster()); p.child.closed = true; await p.tick();
  assert.equal((await result).status, 'unknown'); b.close(); p.close();
});
test('contract: lost confirmation yields unknown and same-transfer retry does not reapply', async () => {
  const pair = fakePair({ dropResults: true }); let applied = 0;
  pair.receive = (_, respond) => { applied++; respond({ status: 'applied' }); };
  const bridge = M.createBridge({ app: 'oneq', window: pair.parent, timeoutMs: 20000 });
  const payload=roster(); const pending = bridge.send('prime', payload); await pair.flush();
  // Explicit clock control prevents relying on wall time for application of the first transfer.
  const originalNow = Date.now; let now = originalNow(); Date.now = () => now;
  try { await pair.tick(); now += 30000; await pair.tick(); assert.equal((await pending).status, 'unknown'); assert.equal(applied, 1); pair.dropResults=false; const retry=bridge.retry('prime',payload.transferId); await pair.flush(); assert.equal((await retry).status,'applied'); assert.equal(applied,1); }
  finally { Date.now = originalNow; bridge.close(); pair.close(); }
});
test('contract: different event cannot reuse an established connection', async () => {
  const pair = fakePair(), bridge = M.createBridge({ app: 'oneq', window: pair.parent });
  bridge.send('prime', roster()); await pair.flush();
  const other = roster(); other.eventId = 'other-event';
  assert.equal((await bridge.send('prime', other)).status, 'conflict'); bridge.close(); pair.close();
});

test('contract: malformed replies from a connected window are quietly rejected', async () => {
  const pair=fakePair(); let receives=0;
  pair.receive=(_,respond)=>{receives++;respond({status:'applied'});};
  const bridge=M.createBridge({app:'oneq',window:pair.parent});const packet=roster();
  const result=bridge.send('prime',packet);await pair.flush();await pair.tick();await result;
  const session=new URLSearchParams(pair.child.location.hash.slice(1)).get('mach-session');
  assert.doesNotThrow(()=>pair.parentHandlers.forEach(fn=>fn({origin:pair.parent.location.origin,source:pair.child,data:{channel:'mach-explicit-handoff',schemaVersion:1,session,from:'prime',to:'oneq',type:'result',eventId:packet.eventId,transferId:packet.transferId,result:JSON.parse('{"status":"applied","constructor":{}}')}})));
  bridge.close();pair.close();assert.equal(receives,1);
});
test('contract: total traversal budget rejects excessively wide or large payloads',()=>{
  const p=roster();p.unexpected='x'.repeat(M.LIMIT+1);assert.throws(()=>M.validateTransfer(p),/너무/);
  const q=roster();q.unexpected=Array.from({length:9000},()=>[1,2,3,4,5]);assert.throws(()=>M.validateTransfer(q),/너무/);
});
