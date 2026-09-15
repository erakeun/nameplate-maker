import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
const bridge=html.slice(html.indexOf('      const SEAT_PLANNER_ORIGIN'),html.indexOf('      if ("ResizeObserver" in window)'));
function harness(){
 const nodes=new Map(),store=new Map(),messages=[],listeners={},status=[];
 function node(){return {style:{},events:{},open:false,textContent:'',setAttribute(){},append(){},addEventListener(k,fn){this.events[k]=fn},querySelector(s){if(!nodes.has(s))nodes.set(s,node());return nodes.get(s)},showModal(){this.open=true},close(){this.open=false}}}
 const source={postMessage:(data,origin)=>messages.push({data,origin})};
 const state={people:[{name:'가상 기존참석자'}],customLogos:[],design:{font:'retained'},selectedIndex:0};
 const ctx={state,STORAGE_KEY:'test-project',document:{createElement:node,body:{append(){}}},localStorage:{getItem:k=>store.get(k)||null,setItem:(k,v)=>store.set(k,v)},location:{hostname:'erakeun.github.io'},window:{opener:source,addEventListener:(k,fn)=>listeners[k]=fn},sanitizePerson:p=>p,renderAll(){},showStatus:s=>status.push(s),setTimeout(){},Blob};
 vm.createContext(ctx);vm.runInContext('let lastSavedProject = null; let projectRecoveryBlocked = false;\n'+bridge,ctx);
 const send=(data,options={})=>listeners.message({origin:'https://erakeun.github.io',source,data,...options});
 const payload=n=>({type:'erica-seat-planner:nameplates:v1',source:'erica-seat-planner',transferId:`transfer-${n}`,people:Array.from({length:n},(_,i)=>({name:`가상${i}`,organization:'감사기관',position:'담당',logoKey:'none'}))});
 return {state,store,messages,send,payload,nodes,ctx,status};
}
for(const n of [1,28,63])test(`${n} people require explicit acceptance; backup preserves complete previous project`,()=>{const h=harness();const original=JSON.stringify(h.state);h.send(h.payload(n));assert.equal(h.state.people[0].name,'가상 기존참석자');assert.equal(h.messages.length,0);h.nodes.get('#seat-planner-transfer-accept').events.click();assert.equal(h.state.people.length,n);assert.equal(h.store.get('test-project:before-seat-planner'),original);assert.equal(h.state.design.font,'retained');assert.ok(h.messages[0].data.type.endsWith(':accepted'))});
test('cancel retains list and duplicate deliveries do not reopen pending transfer',()=>{const h=harness();h.send(h.payload(28));h.nodes.get('#seat-planner-transfer-cancel').events.click();h.send(h.payload(28));assert.equal(h.state.people.length,1);assert.ok(h.messages.every(m=>m.data.type.endsWith(':rejected')))});
test('accepted retry does not replace later user edits',()=>{const h=harness();h.send(h.payload(1));h.nodes.get('#seat-planner-transfer-accept').events.click();h.state.people[0].name='수동변경';h.send(h.payload(1));assert.equal(h.state.people[0].name,'수동변경');assert.equal(h.messages.length,2)});
test('wrong origin, non-opener, malformed, missing IDs and excessive arrays rejected',()=>{const h=harness();h.send(h.payload(1),{origin:'https://untrusted.invalid'});h.send(h.payload(1),{source:{postMessage(){}}});h.send({...h.payload(1),transferId:undefined});h.send(h.payload(64));h.send({...h.payload(1),people:[{name:{bad:true},organization:'',position:''}]});assert.equal(h.messages.length,0);assert.equal(h.nodes.get('#seat-planner-transfer-summary'),undefined);assert.equal(h.state.people[0].name,'가상 기존참석자')});
test('storage failure preserves existing in-memory list and sends no success',()=>{const h=harness();h.send(h.payload(28));h.ctx.localStorage.setItem=()=>{throw new Error('quota')};h.nodes.get('#seat-planner-transfer-accept').events.click();assert.equal(h.state.people[0].name,'가상 기존참석자');assert.equal(h.messages.length,0);assert.ok(h.status.at(-1).includes('실패'))});
test('another window changed project while confirmation is open: do not replace',()=>{const h=harness();h.send(h.payload(28));h.store.set('test-project','newer-other-window');h.nodes.get('#seat-planner-transfer-accept').events.click();assert.equal(h.store.get('test-project'),'newer-other-window');assert.equal(h.state.people[0].name,'가상 기존참석자');assert.equal(h.messages.length,0)});
