import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
function context(raw){
 const store=new Map([['project',raw]]),downloads=[];
 const c={STORAGE_KEY:'project',lastSavedProject:null,projectRecoveryBlocked:false,defaultDesign:{},state:{people:[],customLogos:[],design:{},selectedIndex:0},localStorage:{getItem:k=>store.get(k)||null,setItem:(k,v)=>store.set(k,v)},showStatus(){},renderAll(){},sanitizePerson:p=>({...p}),sanitizeCustomLogo:p=>({...p}),clamp:(n,min,max)=>Math.min(max,Math.max(min,n)),downloadText:(name,text)=>downloads.push({name,text}),FileReader:class{readAsText(text){this.result=text;this.onload()}}};
 vm.createContext(c);
 for(const name of ['restoreLocal','saveLocal','exportProject','importProject'])vm.runInContext(html.match(new RegExp(`^      function ${name}\\([^]*?^      }`,'m'))[0],c);
 return {c,store,downloads};
}
for(const raw of ['{broken','null','{"people":[null]}'])test('corrupt original is retained and downloadable: '+raw,()=>{const {c,store,downloads}=context(raw);c.restoreLocal();c.saveLocal();assert.equal(store.get('project'),raw);assert.equal(c.projectRecoveryBlocked,true);c.exportProject();assert.equal(downloads[0].text,raw)});
test('valid import recovers only after backing up corrupt original',()=>{const {c,store}=context('{broken');c.restoreLocal();c.importProject(JSON.stringify({people:[{name:'가상 복구'}],design:{},customLogos:[]}));c.saveLocal();assert.equal(c.projectRecoveryBlocked,false);assert.equal(store.get('project:before-seat-planner'),'{broken');assert.equal(JSON.parse(store.get('project')).people[0].name,'가상 복구')});
test('invalid person prevents partial JSON project replacement',()=>{const raw=JSON.stringify({people:[{name:'기존 가상'}],customLogos:[],design:{}});const {c,store}=context(raw);c.restoreLocal();c.importProject(JSON.stringify({people:[null],customLogos:[{id:'new'}]}));assert.equal(c.state.people[0].name,'기존 가상');assert.equal(c.state.customLogos.length,0);assert.equal(store.get('project'),raw)});
