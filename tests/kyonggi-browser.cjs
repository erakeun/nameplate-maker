const assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),http=require('node:http');
const {chromium}=require('playwright');
const root=path.resolve(__dirname,'..'),out=path.join(root,process.env.TEST_BASE_URL?'test-results/kyonggi-production':'test-results/kyonggi');
(async()=>{
await fs.mkdir(out,{recursive:true});
const server=http.createServer(async(req,res)=>{let p=decodeURIComponent(new URL(req.url,'http://localhost').pathname);if(p.endsWith('/'))p+='index.html';const f=path.resolve(root,'.'+p);if(!f.startsWith(root+path.sep)){res.writeHead(403);return res.end();}try{res.setHeader('Content-Type',f.endsWith('.html')?'text/html; charset=utf-8':f.endsWith('.js')?'text/javascript':f.endsWith('.svg')?'image/svg+xml':f.endsWith('.png')?'image/png':'text/plain');res.end(await fs.readFile(f));}catch{res.writeHead(404);res.end();}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));let browser;
try{
browser=await chromium.launch({channel:'chrome',headless:true});const context=await browser.newContext({viewport:{width:1440,height:1000}}),page=await context.newPage();
const base=process.env.TEST_BASE_URL||`http://127.0.0.1:${server.address().port}`,key='kyonggi-nameplate-maker-project-v1';
const errors=[],external=[];page.on('pageerror',e=>errors.push(e.message));await context.route('**/*',r=>{if(!r.request().url().startsWith(base+'/')){external.push(r.request().url());return r.abort();}return r.continue();});
await page.goto(base+'/');const old=await page.evaluate(()=>localStorage.getItem('nameplate-maker-project-v27'));
await page.goto(base+'/kyonggi/');await page.waitForFunction(()=>document.querySelector('#previewPage .logo-box img')?.complete);
const state=()=>page.evaluate(k=>JSON.parse(localStorage.getItem(k)),key);
assert.equal((await state()).design.defaultLeftLogo,'giryong-1');
await page.evaluate(()=>{document.querySelectorAll('details').forEach(d=>d.open=true);window.printCalls=[];window.print=()=>printCalls.push(document.body.className);});
await page.screenshot({path:path.join(out,'desktop.png'),fullPage:true});
for(let i=1;i<=6;i++){await page.selectOption('#defaultLeftLogo',`giryong-${i}`);await page.waitForFunction(()=>[...document.querySelectorAll('#previewPage img')].every(i=>i.complete&&i.naturalWidth));assert.match(await page.locator('#previewPage .logo-box img').first().getAttribute('src'),new RegExp(`giryong-${i}.png`));}
await page.selectOption('#defaultLeftLogo','none');assert.equal(await page.locator('#previewPage .logo-box img').count(),0);
await page.selectOption('#footerLogo','none');assert.equal(await page.locator('#previewPage .footer-logo-box img').count(),0);
await page.selectOption('#defaultLeftLogo','kyonggi');assert.match(await page.locator('#previewPage .logo-box img').first().getAttribute('src'),/assets\/logo.png/);
await page.selectOption('#defaultLeftLogo','giryong-1');await page.selectOption('#footerLogo','kyonggi');
await page.fill('#bulkInput','홍예시\t경기대학교\t행사 담당\t기룡이 2\n김가상\t경기대학교\t진행 담당\t기본');await page.click('#replaceBulkBtn');assert.equal((await state()).people.length,2);assert.equal((await state()).people[0].logoKey,'giryong-2');
await page.fill('#bulkInput','이가상\t경기대학교\t참석자\t없음');await page.click('#appendBulkBtn');assert.equal((await state()).people.length,3);
await page.fill('#nameSizeNumber','64');await page.dispatchEvent('#nameSizeNumber','input');await page.fill('#nameXNumber','2');await page.dispatchEvent('#nameXNumber','input');await page.fill('#titleSizeNumber','23');await page.dispatchEvent('#titleSizeNumber','input');
await page.fill('#nameColorHex','#389D89');await page.dispatchEvent('#nameColorHex','change');assert.equal((await state()).design.nameColor,'#389d89');
const before=await state();const downloadP=page.waitForEvent('download');await page.click('#saveProjectBtn');const download=await downloadP;await download.saveAs(path.join(out,'saved-project.json'));const exported=JSON.parse(await fs.readFile(path.join(out,'saved-project.json'),'utf8'));assert.equal(exported.app,'kyonggi-nameplate-maker');
await page.reload();assert.deepEqual((await state()).people,before.people);assert.equal((await state()).design.nameX,2);
await page.fill('#bulkInput','교체용\t가상 소속\t가상 직위');await page.click('#replaceBulkBtn');await page.setInputFiles('#projectFileInput',path.join(out,'saved-project.json'));await page.waitForFunction(()=>document.querySelector('#peopleTableBody').rows.length===3);assert.deepEqual((await state()).people,before.people);
const safe=await state();await page.setInputFiles('#projectFileInput',{name:'other.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify({...exported,app:'nameplate-maker'}))});await page.waitForFunction(()=>document.querySelector('#status').textContent.includes('읽지 못'));assert.deepEqual(await state(),safe);
await page.evaluate(()=>{document.querySelectorAll('details').forEach(d=>d.open=true);window.printCalls=[];window.print=()=>printCalls.push(document.body.className);});
await page.fill('#bulkInput','홍길동가상긴이름\t경기대학교 미래융합교육지원협력단\t국제교육협력운영지원담당\t기본');await page.click('#replaceBulkBtn');
for(const size of ['200x70','200x80','250x80','255x85']){await page.selectOption('#platePreset',size);await page.waitForTimeout(100);assert.equal(await page.locator('#textOverflowAlert').isVisible(),false,`long text overflow ${size}`);await page.locator('#previewPage').screenshot({path:path.join(out,`long-${size}.png`)});}
await page.fill('#plateWidth','240');await page.dispatchEvent('#plateWidth','change');await page.fill('#plateHeight','75');await page.dispatchEvent('#plateHeight','change');assert.equal((await state()).design.plateWidth,240);
await page.fill('#bulkInput','홍예시\t경기대학교\t행사 담당\t기본');await page.click('#replaceBulkBtn');await page.selectOption('#platePreset','250x80');
for(const [i,t] of ['basic','minimal','frame','gold','geometric'].entries()){
await page.click(`[data-template="${t}"]`);await page.selectOption('#defaultLeftLogo',`giryong-${i+1}`);await page.waitForFunction(()=>[...document.querySelectorAll('#previewPage img')].every(i=>i.complete&&i.naturalWidth));
await page.locator('#previewPage').screenshot({path:path.join(out,`design-${t}.png`)});
const calls=await page.evaluate(()=>printCalls.length);await page.click('#printCurrentBtn');await page.waitForFunction(n=>printCalls.length>n,calls);await page.pdf({path:path.join(out,`design-${t}.pdf`),preferCSSPageSize:true,printBackground:true});await page.evaluate(()=>dispatchEvent(new Event('afterprint')));
}
await page.fill('#bulkInput','홍예시\t경기대학교\t행사 담당\t기룡이 1\n김가상\t경기대학교\t진행 담당\t기룡이 6');await page.click('#replaceBulkBtn');
let calls=await page.evaluate(()=>printCalls.length);await page.click('#printAllBtn');await page.waitForFunction(n=>printCalls.length>n,calls);await page.pdf({path:path.join(out,'all.pdf'),preferCSSPageSize:true,printBackground:true});await page.evaluate(()=>dispatchEvent(new Event('afterprint')));
const imagePaths=await page.locator('#printStage img').evaluateAll(is=>is.map(i=>i.getAttribute('src')));assert.ok(imagePaths.every(s=>s.startsWith('assets/')&&!/hanyang|erica/.test(s)));
await page.setViewportSize({width:390,height:844});await page.click('#mobilePreviewToggleBtn');await page.screenshot({path:path.join(out,'mobile.png')});await page.click('#mobilePreviewCloseBtn');assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
assert.equal(await page.evaluate(()=>localStorage.getItem('nameplate-maker-project-v27')),old);await page.goto(base+'/');assert.match(await page.locator('#previewPage .logo-box img').first().getAttribute('src'),/hanyang/);assert.equal(await page.evaluate(()=>localStorage.getItem('nameplate-maker-project-v27')),old);
assert.deepEqual(errors,[]);assert.deepEqual(external,[]);await fs.writeFile(path.join(out,'results.json'),JSON.stringify({passed:true,chrome:browser.version(),checks:['six official characters','logo toggles','bulk replace/append','size/position/color editing','download JSON reopen','reload restore','reject Hanyang project','four presets with long text','custom size','five designs/PDF','all print PDF','mobile','Hanyang same-origin storage unchanged','zero external requests','zero JS errors']},null,2));console.log('PASS kyonggi browser checks; '+out);
}finally{if(browser)await browser.close();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1;});
