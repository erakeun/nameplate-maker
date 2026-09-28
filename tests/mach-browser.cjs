const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const URL_BASE = process.env.TEST_URL || 'http://127.0.0.1:4177/nameplate-maker/';
const KEY = 'nameplate-maker-project-v27';
const p = (id, name = '가상검증') => ({participantId:id,name,organization:'가상기관',position:'담당',status:'attending',seatId:'',replacesParticipantId:''});
const transfer = (participants, revision, transferId = `t-${revision}`) => ({schemaVersion:1,kind:'roster',eventId:'synthetic-event',eventName:'가상 변경 검증',revision,baseRevision:0,transferId,participants});
(async()=>{
 const browser=await chromium.launch({channel:'chrome',headless:true});const artifacts=await fs.mkdtemp(path.join(os.tmpdir(),'mach-nameplate-'));
 try {
 const context=await browser.newContext({viewport:{width:1440,height:1000}});const page=await context.newPage();const errors=[], requests=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>requests.push({url:r.url(),method:r.method(),body:r.postData()}));page.on('dialog',d=>d.accept());
 await page.goto(URL_BASE,{waitUntil:'networkidle'});
 const saved=()=>page.evaluate(k=>JSON.parse(localStorage.getItem(k)),KEY);
 const upload=async data=>{await page.locator('#mach-file').setInputFiles({name:'synthetic.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(data))});await page.locator('#mach-change-dialog').waitFor({state:'visible'});};
 const apply=async()=>{await page.locator('#mach-review-apply').click();await page.locator('#mach-change-dialog').waitFor({state:'hidden'});};
 await page.locator('#clearPeopleBtn').click();
 const design=(await saved()).design;
 const first=transfer([p('p1'),p('p2','가상대상'),p('p3','가상동료')],1);
 await upload(first);assert.equal((await saved()).people.length,0);await page.getByRole('button',{name:'취소 · 내용 유지',exact:true}).click();assert.equal((await saved()).people.length,0);
 await upload(first);await apply();assert.equal((await saved()).people.length,3);assert.deepEqual((await saved()).design,design);
 await page.locator('#peopleTableBody tr').nth(2).locator('input[data-person-field=organization]').fill('별도 표시 기관');
 await page.locator('#peopleTableBody tr').nth(2).locator('input[data-person-field=organization]').dispatchEvent('change');
 await page.evaluate(()=>{window.printed=[];window.print=()=>window.printed.push({names:[...document.querySelectorAll('#printStage .plate-name')].map(n=>n.textContent),pages:document.querySelectorAll('#printStage .paper-page').length,pairs:[...document.querySelectorAll('#printStage .paper-page')].map(p=>p.querySelectorAll('.nameplate').length)});});
 await page.locator('#mach-select-all').click();await page.locator('#mach-print-selected').click();await page.waitForFunction(()=>window.printed.length===1);
 assert.deepEqual(await page.evaluate(()=>window.printed[0].pairs),[2,2,2]);let state=await saved();assert.equal(state.mach.printJobs.length,1);assert.deepEqual(state.mach.confirmed,{});
 await page.locator('#peopleTableBody tr').nth(0).locator('input[data-person-field=name]').fill('가상수정');await page.locator('#peopleTableBody tr').nth(0).locator('input[data-person-field=name]').dispatchEvent('change');
 await page.locator('#mach-jobs button').first().click();state=await saved();assert.equal(state.mach.confirmed.p1.render.name,'가상검증');assert.match(await page.locator('#mach-print-list').innerText(),/가상수정 · 수정 재출력 필요/);assert.equal(await page.locator('#mach-print-list input:checked').count(),1);await page.locator('#mach-preview').click();assert.equal(await page.locator('#mach-selected-preview .paper-page').count(),1);await page.getByRole('button',{name:'닫기',exact:true}).click();
 const changes=transfer([{...p('p1'),position:'새 직책'},{...p('p2','가상대상'),status:'absent'},p('p3','가상동료'),{...p('p4','가상대리'),replacesParticipantId:'p2'},p('p5','가상추가')],2);
 await upload(changes);await page.locator('[data-select-id=p2]').uncheck();await page.locator('[data-select-id=p4]').uncheck();await page.locator('[data-select-id=p5]').uncheck();await apply();state=await saved();assert.equal(state.people.find(p=>p.id==='p2').status,'attending');assert.equal(state.people.length,3);assert.equal(state.people[2].organization,'별도 표시 기관');assert.deepEqual(state.design,design);
 await upload(changes);await apply();state=await saved();assert.equal(state.people.length,5);assert.equal(state.mach.recalls.p2.status,'pending');assert.equal(state.people[2].organization,'별도 표시 기관');assert.ok(!await page.locator('#mach-print-list').innerText().then(t=>t.includes('가상대상')));
 // Personal source conflict remains pending if the display is explicitly retained.
 const conflict=transfer([{...p('p3','가상동료'),organization:'새 기관'}],3);
 await upload(conflict);await page.locator('[data-select-id=p3]').check();await page.locator('[data-field-id=p3]').selectOption('local');await apply();state=await saved();assert.equal(state.people[2].organization,'별도 표시 기관');assert.deepEqual(state.mach.applied['t-3'].pendingIds,['p3']);
 await upload(conflict);await page.locator('[data-select-id=p3]').check();await page.locator('[data-field-id=p3]').selectOption('incoming');await apply();assert.equal((await saved()).people[2].organization,'새 기관');
 // Change-only selection prints a subset, preserving the complete list and paired faces.
 await page.locator('#mach-changed-only').uncheck();await page.locator('#mach-changed-only').check();await page.locator('[data-participant-id=p4]').check();const beforeSubset=await saved();await page.locator('#mach-preview').click();assert.equal(await page.locator('#mach-selected-preview .nameplate').count(),2);await page.getByRole('button',{name:'닫기',exact:true}).click();
 await page.locator('#mach-print-selected').click();await page.waitForFunction(()=>window.printed.length===2);assert.deepEqual(await page.evaluate(()=>window.printed[1].pairs),[2]);assert.deepEqual((await saved()).people,beforeSubset.people);assert.deepEqual((await saved()).design,beforeSubset.design);
 await page.pdf({path:path.join(artifacts,'selected-duplex.pdf'),format:'A4',landscape:true,printBackground:true});
 await page.locator('#mach-jobs button').first().click();await page.locator('#mach-recalls button').click();assert.equal((await saved()).mach.recalls.p2.status,'collected');
 // Save/clear/restore roundtrip covers all histories and display settings.
 let downloadPromise=page.waitForEvent('download');await page.locator('#saveProjectBtn').click();let download=await downloadPromise;const projectFile=JSON.parse(await fs.readFile(await download.path(),'utf8'));const expected=await saved();await page.evaluate(k=>localStorage.removeItem(k),KEY);await page.reload({waitUntil:'networkidle'});await page.locator('#projectFileInput').setInputFiles({name:'roundtrip.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(projectFile))});await page.waitForFunction(k=>JSON.parse(localStorage.getItem(k)).mach?.eventId==='synthetic-event',KEY);assert.deepEqual((await saved()).mach,expected.mach);assert.deepEqual((await saved()).people,expected.people);assert.deepEqual((await saved()).design,expected.design);
 // Migration writes stable IDs once and keeps an untouched raw pre-migration backup.
 const legacy={people:[{name:'가상 기존',organization:'가상',position:'담당',logoKey:'none'}],customLogos:[],design};await page.evaluate(({k,v})=>localStorage.setItem(k,JSON.stringify(v)),{k:KEY,v:legacy});await page.reload({waitUntil:'networkidle'});const id=(await saved()).people[0].id;await page.reload({waitUntil:'networkidle'});assert.equal((await saved()).people[0].id,id);assert.deepEqual(await page.evaluate(k=>JSON.parse(localStorage.getItem(k+':before-migration')),KEY),legacy);
 // Long Korean labels: oversized text is blocked, adjusted multiline content retains both faces.
 await page.evaluate(()=>{window.longPrints=0;window.print=()=>window.longPrints++;});
 const nameInput=page.locator('#peopleTableBody tr').first().locator('input[data-person-field=name]');
 await nameInput.fill('가상긴이름'.repeat(25));await nameInput.dispatchEvent('change');await page.locator('#printCurrentBtn').click();await page.waitForFunction(()=>document.querySelector('#status').textContent.includes('초과'));assert.equal(await page.evaluate(()=>window.longPrints),0);
 await nameInput.fill('가상긴이름검증');await nameInput.dispatchEvent('change');
 const orgInput=page.locator('#peopleTableBody tr').first().locator('input[data-person-field=organization]');await orgInput.fill('가상 국제학술교류 협력기관');await orgInput.dispatchEvent('change');
 const posInput=page.locator('#peopleTableBody tr').first().locator('input[data-person-field=position]');await posInput.fill('공동연구협력 총괄책임자');await posInput.dispatchEvent('change');
 await page.locator('#titleSeparator').selectOption('__LINE_BREAK__');await page.locator('#nameSpacingNumber').fill('4');await page.locator('#nameSpacingNumber').dispatchEvent('input');await page.locator('#titleSizeNumber').fill('20');await page.locator('#titleSizeNumber').dispatchEvent('input');
 await page.locator('#printCurrentBtn').click();await page.waitForFunction(()=>window.longPrints===1);assert.equal(await page.locator('#printStage .nameplate').count(),2);await page.pdf({path:path.join(artifacts,'long-korean-duplex.pdf'),format:'A4',landscape:true,printBackground:true});
 for(const width of [390,412]){await page.setViewportSize({width,height:900});await page.locator('#mach-import').scrollIntoViewIfNeeded();assert.equal(await page.locator('#mach-import').isVisible(),true);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+2),false);await page.screenshot({path:path.join(artifacts,`mobile-${width}.png`)});}
 assert.deepEqual(errors,[]);assert.equal(requests.filter(r=>r.method!=='GET').length,0);assert.equal(requests.some(r=>r.url.includes(encodeURIComponent('가상'))||r.url.includes('synthetic-event')||r.body),false);
 console.log('PASS nameplate MACH: preview/cancel, selective apply, display conflicts, frozen completion, recall, paired partial print/PDF, migration, roundtrip, 390/412px, no input-bearing network requests.');console.log('Artifacts:',artifacts);
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
