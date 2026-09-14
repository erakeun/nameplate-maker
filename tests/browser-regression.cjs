const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const http = require('node:http');
const os = require('node:os');
const { chromium } = require('playwright');

const repo = path.resolve(__dirname, '..');
const fixtures = path.join(__dirname, 'fixtures');
const target = process.env.TEST_URL;
const label = target ? 'production' : 'local';

(async () => {
  const artifacts = process.env.TEST_ARTIFACT_DIR || await fs.mkdtemp(path.join(os.tmpdir(), 'nameplate-browser-'));
  await fs.mkdir(artifacts, { recursive: true });
  const server = target ? null : http.createServer(async (req, res) => {
    const pathname = new URL(req.url, 'http://localhost').pathname;
    const resolved = path.resolve(repo, '.' + (pathname === '/' ? '/index.html' : pathname));
    if (!resolved.startsWith(repo + path.sep)) { res.writeHead(403); res.end(); return; }
    try {
      const data = await fs.readFile(resolved);
      res.setHeader('Content-Type', resolved.endsWith('.html') ? 'text/html; charset=utf-8' : 'image/png');
      res.end(data);
    } catch { res.writeHead(404); res.end(); }
  });
  if (server) await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  let browser;
  try {
    browser = await chromium.launch({ channel: 'chrome', headless: true });
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.route(/google-analytics\.com|googletagmanager\.com/, route => route.abort());
    const url = target || `http://127.0.0.1:${server.address().port}/`;
    const response = await page.goto(url, { waitUntil: 'networkidle' });
    assert.equal(response.status(), 200);
    assert.match(await page.locator('#versionBadge').innerText(), /V2\.9\.1/);
    await page.evaluate(() => {
      window.printCalls = [];
      window.print = () => window.printCalls.push({ current: document.body.classList.contains('print-current') });
    });
    const rows = () => page.locator('#peopleTableBody tr').evaluateAll(trs => trs.map(tr =>
      Array.from(tr.querySelectorAll('input,select'), input => input.value)));
    const saved = () => page.evaluate(() => JSON.parse(localStorage.getItem('nameplate-maker-project-v27')));
    const initial = await saved();
    const upload = async (input, file, message) => {
      await page.locator('#status').evaluate(element => { element.textContent = ''; });
      await page.locator(input).setInputFiles(file);
      await page.waitForFunction(text => document.querySelector('#status').textContent === text, message);
    };
    const csvExpected = [['이기정', '', '총장', 'hanyang'], ['김민수', '', '부총장', 'hanyang']];
    const tsvExpected = [['이기정', '한양대학교', '총장', 'default'], ['김민수', '한양대학교', '부총장', 'default']];
    for (const filename of ['utf8.csv', 'utf8-bom.csv', 'cp949.csv', 'euc-kr.csv', 'utf8-lf.tsv', 'utf8-crlf.tsv', 'cp949-lf.tsv', 'cp949-crlf.tsv']) {
      await upload('#csvFileInput', path.join(fixtures, filename), '2명의 명단을 불러왔습니다.');
      assert.deepEqual(await rows(), filename.endsWith('.csv') ? csvExpected : tsvExpected);
      const project = await saved();
      assert.deepEqual(project.design, initial.design);
      assert.deepEqual(project.customLogos, initial.customLogos);
      assert.deepEqual(project.people.map(person => person.name), ['이기정', '김민수']);
      assert.deepEqual(await page.locator('#previewPage .plate-name').allTextContents(), ['이기정', '이기정']);
      assert.deepEqual(await page.locator('#printStage .plate-name').allTextContents(), ['이기정', '이기정', '김민수', '김민수']);
      assert.equal(await page.locator('#csvFileInput').inputValue(), '');
      console.log(`PASS ${label}: ${filename} → inputs/state/preview/print`);
    }
    for (const filename of ['quoted-utf8.csv', 'quoted-cp949.csv']) {
      await upload('#csvFileInput', path.join(fixtures, filename), '2명의 명단을 불러왔습니다.');
      assert.deepEqual(await rows(), [['이,기정', '한양"대학교', '총장', 'default'], ['김민수', '', '부총장', 'default']]);
    }
    console.log(`PASS ${label}: quoted CSV files`);
    await upload('#csvFileInput', path.join(fixtures, 'cp949-extended.csv'), '1명의 명단을 불러왔습니다.');
    assert.equal((await rows())[0][0], '갂뷁힣');
    console.log(`PASS ${label}: CP949 extended Hangul`);
    const beforeError = await saved();
    for (const byte of [0x81, 0xff]) {
      await upload('#csvFileInput', { name: 'invalid.csv', mimeType: 'text/csv', buffer: Buffer.from([byte]) }, '파일의 문자 인코딩을 확인해 주세요.');
      assert.deepEqual(await saved(), beforeError);
    }
    await upload('#csvFileInput', { name: 'empty.csv', mimeType: 'text/csv', buffer: Buffer.alloc(0) }, '명단을 찾지 못했습니다. 열 순서는 이름, 소속, 직책, 좌측 로고입니다.');
    assert.deepEqual(await saved(), beforeError);
    console.log(`PASS ${label}: invalid/empty imports preserve state`);
    await page.locator('#bulkInput').fill('"이,기정","한양""대학교",총장,한양대학교\r\n김민수\t한양대학교\t부총장');
    await page.locator('#replaceBulkBtn').click();
    assert.deepEqual(await rows(), [['이,기정', '한양"대학교', '총장', 'hanyang'], ['김민수', '한양대학교', '부총장', 'default']]);
    await page.locator('#bulkInput').fill('이기정\t한양대학교\t총장');
    await page.locator('#appendBulkBtn').click();
    assert.equal((await rows()).length, 3);
    await page.locator('#replaceBulkBtn').click();
    assert.deepEqual(await rows(), [['이기정', '한양대학교', '총장', 'default']]);
    console.log(`PASS ${label}: paste CSV quotes/tabs/CRLF, replace, append`);
    await upload('#csvFileInput', path.join(fixtures, 'cp949.csv'), '2명의 명단을 불러왔습니다.');
    const project = await saved();
    const downloadPromise = page.waitForEvent('download');
    await page.locator('#saveProjectBtn').click();
    const download = await downloadPromise;
    const json = JSON.parse(await fs.readFile(await download.path(), 'utf8'));
    assert.deepEqual(json.people, project.people);
    assert.equal(json.version, '2.9.1');
    await page.locator('#bulkInput').fill('교체검증,테스트,담당자');
    await page.locator('#replaceBulkBtn').click();
    await upload('#projectFileInput', { name: 'project.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(json)) }, '작업 파일을 불러왔습니다.');
    assert.deepEqual(await rows(), csvExpected);
    const beforeJsonError = await saved();
    await upload('#projectFileInput', { name: 'invalid.json', mimeType: 'application/json', buffer: Buffer.from('{bad') }, '작업 파일을 읽지 못했습니다. 올바른 JSON 파일인지 확인해 주세요.');
    assert.deepEqual(await saved(), beforeJsonError);
    console.log(`PASS ${label}: JSON export/import and invalid JSON`);
    await page.locator('#thumbs .thumb').nth(1).click();
    assert.equal(await page.locator('#pageCounter').innerText(), '2 / 2');
    assert.deepEqual(await page.locator('#previewPage .plate-name').allTextContents(), ['김민수', '김민수']);
    await page.locator('#printCurrentBtn').click();
    await page.waitForFunction(() => window.printCalls.length === 1);
    assert.deepEqual(await page.evaluate(() => window.printCalls), [{ current: true }]);
    assert.equal(await page.locator('#printStage .paper-page.is-current').getAttribute('data-index'), '1');
    await page.emulateMedia({ media: 'print' });
    assert.equal(await page.locator('#printStage .paper-page:visible').count(), 1);
    await page.pdf({ path: path.join(artifacts, `${label}-current.pdf`), preferCSSPageSize: true, printBackground: true });
    await page.emulateMedia({ media: 'screen' });
    await page.evaluate(() => window.dispatchEvent(new Event('afterprint')));
    await page.locator('#printAllBtn').click();
    await page.waitForFunction(() => window.printCalls.length === 2);
    assert.deepEqual(await page.evaluate(() => window.printCalls), [{ current: true }, { current: false }]);
    await page.emulateMedia({ media: 'print' });
    assert.equal(await page.locator('#printStage .paper-page:visible').count(), 2);
    const size = await page.locator('#printStage .paper-page').first().evaluate(element => ({ width: getComputedStyle(element).width, height: getComputedStyle(element).height }));
    assert.ok(Math.abs(parseFloat(size.width) - 297 * 96 / 25.4) < 0.1);
    assert.ok(Math.abs(parseFloat(size.height) - 210 * 96 / 25.4) < 0.1);
    await page.pdf({ path: path.join(artifacts, `${label}-all.pdf`), preferCSSPageSize: true, printBackground: true });
    await page.emulateMedia({ media: 'screen' });
    await page.evaluate(() => window.dispatchEvent(new Event('afterprint')));
    console.log(`PASS ${label}: preview navigation, current/all print, A4 landscape PDF`);
    await page.screenshot({ path: path.join(artifacts, `${label}-desktop.png`), fullPage: true });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.locator('#mobilePreviewToggleBtn').click();
    assert.equal(await page.locator('#mobilePreviewToggleBtn').getAttribute('aria-expanded'), 'true');
    assert.equal(await page.locator('#previewWorkspace').getAttribute('role'), 'dialog');
    await page.screenshot({ path: path.join(artifacts, `${label}-mobile.png`) });
    await page.locator('#mobilePreviewCloseBtn').click();
    assert.equal(await page.locator('#mobilePreviewToggleBtn').getAttribute('aria-expanded'), 'false');
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    console.log(`PASS ${label}: mobile preview and horizontal overflow`);
    assert.deepEqual(errors, []);
    console.log(`PASS ${label}: no JavaScript errors; Chrome ${browser.version()}; ${url}`);
    console.log(`Artifacts: ${artifacts}`);
  } finally {
    if (browser) await browser.close();
    if (server) await new Promise(resolve => server.close(resolve));
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
