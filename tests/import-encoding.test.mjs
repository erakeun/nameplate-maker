import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

const source = readFileSync(process.env.NAMEPLATE_SOURCE || new URL("../index.html", import.meta.url), "utf8");
const fixture = name => readFileSync(new URL(`fixtures/${name}`, import.meta.url));
const csvPeople = [
  { name: "이기정", organization: "", position: "총장", logoKey: "hanyang" },
  { name: "김민수", organization: "", position: "부총장", logoKey: "hanyang" },
];
const tsvPeople = csvPeople.map(person => ({ ...person, organization: "한양대학교", logoKey: "default" }));

// Run the application's actual declarations. No production test exports or copied parser.
function declaration(name, required = true) {
  const match = source.match(new RegExp(`^      function ${name}\\([^]*?^      }`, "m"));
  if (required) assert.ok(match, `Missing application function: ${name}`);
  return match?.[0] || "";
}

function harness() {
  const calls = { reads: [], statuses: [], renders: 0, prints: 0, fits: 0 };
  const state = {
    people: [{ id: "existing", name: "기존", organization: "기존소속", position: "기존직책", logoKey: "default" }],
    customLogos: [], selectedIndex: 1, design: { titleSeparator: " " },
  };
  let nextId = 0;
  class FileReader {
    readAsText(file, encoding) {
      calls.reads.push({ method: "readAsText", encoding });
      this.finish(file, file.bytes?.toString("utf8"));
    }
    readAsArrayBuffer(file) {
      calls.reads.push({ method: "readAsArrayBuffer" });
      const bytes = file.bytes || Buffer.alloc(0);
      this.finish(file, bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
    }
    finish(file, result) {
      if (file.error) {
        this.error = new Error("Simulated file read failure");
        this.onerror?.({ target: this });
      } else {
        this.result = result;
        this.onload?.({ target: this });
      }
    }
  }
  const handlers = {};
  const toggles = [];
  const printPages = [0, 1].map(index => ({ classList: { toggle: (...args) => toggles.push([index, ...args]) } }));
  const context = vm.createContext({
    TextDecoder, Uint8Array, ArrayBuffer, FileReader, state,
    BUILTIN_LEFT_LOGOS: { hanyang: {} }, defaultDesign: { titleSeparator: " " },
    cryptoId: () => `test-${++nextId}`,
    renderAll: () => { calls.renders++; },
    showStatus: message => calls.statuses.push(message),
    elements: { bulkInput: { value: "" }, printStage: {} },
    $: selector => ({ addEventListener: (event, callback) => { handlers[selector] = callback; } }),
    $$: () => printPages,
    document: { body: { classList: { toggle: (...args) => toggles.push(["body", ...args]) } } },
    refreshTextOverflowState: () => [],
    requestAnimationFrame: callback => callback(),
    fitText: () => { calls.fits++; },
    window: { print: () => { calls.prints++; } },
  });
  vm.runInContext([
    ...["sanitizePerson", "sanitizeCustomLogo", "normalizeExistingLogoKey", "resolveLogoKeyFromText", "parseRows", "parseCsvLine", "getTitle", "loadDelimitedFile", "importProject", "printPages"].map(name => declaration(name)),
    declaration("decodeDelimitedText", false),
  ].join("\n"), context);
  for (const id of ["replaceBulkBtn", "appendBulkBtn"]) {
    const escaped = `\\$\\("#${id}"\\)\\.addEventListener\\("click", \\(\\) => \\{[^]*?^      \\}\\);`;
    const match = source.match(new RegExp(escaped, "m"));
    assert.ok(match, `Missing application handler: ${id}`);
    vm.runInContext(match[0], context);
  }
  return { context, state, calls, handlers, toggles };
}

const values = people => Array.from(people, ({ name, organization, position, logoKey }) => ({ name, organization, position, logoKey }));
function checkImport(bytes, expected) {
  const h = harness();
  h.context.loadDelimitedFile({ bytes });
  assert.deepEqual(values(h.state.people), expected);
  assert.equal(h.state.selectedIndex, 0);
  assert.equal(h.calls.renders, 1);
  assert.deepEqual(h.calls.statuses, [`${expected.length}명의 명단을 불러왔습니다.`]);
  assert.deepEqual(h.calls.reads, [{ method: "readAsArrayBuffer" }]);
  return h;
}

for (const name of ["utf8.csv", "utf8-bom.csv", "cp949.csv", "euc-kr.csv"]) {
  test(`CSV import preserves Korean fields: ${name}`, () => {
    checkImport(fixture(name), csvPeople);
  });
}

for (const name of ["utf8-lf.tsv", "utf8-crlf.tsv", "cp949-lf.tsv", "cp949-crlf.tsv"]) {
  test(`TSV import preserves Korean fields and line endings: ${name}`, () => {
    checkImport(fixture(name), tsvPeople);
  });
}

// CP949 extension characters and a lone 0x81 must be verified in the real browser
// suite: Node 22's ICU euc-kr mapping differs from WHATWG (nodejs/node#61041).

for (const name of ["quoted-utf8.csv", "quoted-cp949.csv"]) {
  test(`Quoted commas, doubled quotes and empty CSV fields: ${name}`, () => {
    checkImport(fixture(name), [
      { name: "이,기정", organization: '한양"대학교', position: "총장", logoKey: "default" },
      { name: "김민수", organization: "", position: "부총장", logoKey: "default" },
    ]);
  });
}

test("ASCII-only CSV remains readable", () => {
  checkImport(Buffer.from("Alice,University,President\nBob,,VP"), [
    { name: "Alice", organization: "University", position: "President", logoKey: "default" },
    { name: "Bob", organization: "", position: "VP", logoKey: "default" },
  ]);
});

test("A literal replacement character encoded as valid UTF-8 is retained", () => {
  checkImport(Buffer.from("이�정,한양대학교,총장", "utf8"), [
    { name: "이�정", organization: "한양대학교", position: "총장", logoKey: "default" },
  ]);
});

test("The UTF-8 BOM is removed by the decoder before parsing", () => {
  const h = harness();
  assert.equal(h.context.decodeDelimitedText(fixture("utf8-bom.csv")), fixture("utf8.csv").toString("utf8"));
});

for (const bytes of [[0xff]]) {
  test(`Undecodable bytes ${bytes.map(byte => byte.toString(16)).join(" ")} preserve the existing list`, () => {
    const h = harness();
    const before = JSON.stringify(h.state);
    h.context.loadDelimitedFile({ bytes: Buffer.from(bytes) });
    assert.equal(JSON.stringify(h.state), before);
    assert.equal(h.calls.renders, 0);
    assert.deepEqual(h.calls.statuses, ["파일의 문자 인코딩을 확인해 주세요."]);
  });
}

test("Empty files retain the existing empty-list feedback and state", () => {
  const h = harness();
  const before = JSON.stringify(h.state);
  h.context.loadDelimitedFile({ bytes: Buffer.alloc(0) });
  assert.equal(JSON.stringify(h.state), before);
  assert.equal(h.calls.renders, 0);
  assert.deepEqual(h.calls.statuses, ["명단을 찾지 못했습니다. 열 순서는 이름, 소속, 직책, 좌측 로고입니다."]);
});

test("FileReader I/O errors give feedback without replacing existing people", () => {
  const h = harness();
  const before = JSON.stringify(h.state);
  h.context.loadDelimitedFile({ error: true });
  assert.equal(JSON.stringify(h.state), before);
  assert.equal(h.calls.renders, 0);
  assert.equal(h.calls.statuses.length, 1);
  assert.match(h.calls.statuses[0], /파일.*(읽|확인)/);
});

test("Manual paste replace/append handlers retain their parsing and selection behavior", () => {
  const h = harness();
  h.context.elements.bulkInput.value = fixture("utf8.csv").toString("utf8");
  h.handlers["#replaceBulkBtn"]();
  assert.deepEqual(values(h.state.people), csvPeople);
  assert.equal(h.state.selectedIndex, 0);
  assert.equal(h.calls.renders, 1);
  assert.equal(h.calls.statuses.at(-1), "2명의 명단으로 교체했습니다.");
  h.state.selectedIndex = 1;
  h.context.elements.bulkInput.value = fixture("utf8-lf.tsv").toString("utf8");
  h.handlers["#appendBulkBtn"]();
  assert.deepEqual(values(h.state.people), [...csvPeople, ...tsvPeople]);
  assert.equal(h.state.selectedIndex, 1);
  assert.equal(h.calls.renders, 2);
  assert.equal(h.calls.statuses.at(-1), "2명을 기존 명단 뒤에 추가했습니다.");
});

test("Imported names/titles remain available to preview and current/all print actions", () => {
  const h = checkImport(fixture("cp949-crlf.tsv"), tsvPeople);
  assert.equal(h.context.getTitle(h.state.people[0]), "한양대학교 총장");
  assert.equal(h.context.getTitle(h.state.people[1]), "한양대학교 부총장");
  h.state.design.titleSeparator = "__LINE_BREAK__";
  assert.equal(h.context.getTitle(h.state.people[0]), "한양대학교\n총장");
  h.state.selectedIndex = 1;
  h.context.printPages("current");
  h.context.printPages("all");
  assert.equal(h.calls.prints, 2);
  assert.equal(h.calls.fits, 2);
  assert.deepEqual(h.toggles, [
    [0, "is-current", false], [1, "is-current", true], ["body", "print-current", true],
    [0, "is-current", false], [1, "is-current", true], ["body", "print-current", false],
  ]);
});

test("JSON project import keeps its independent UTF-8 text-reader path", () => {
  const h = harness();
  const payload = {
    people: tsvPeople,
    customLogos: [{ id: "custom-1", name: "한글 로고", dataUrl: "data:image/png;base64,AA==" }],
    design: { titleSeparator: " / ", nameSize: 81 },
  };
  h.context.importProject({ bytes: Buffer.from(JSON.stringify(payload), "utf8") });
  assert.deepEqual(values(h.state.people), tsvPeople);
  assert.equal(h.state.customLogos[0].name, "한글 로고");
  assert.equal(h.state.design.nameSize, 81);
  assert.equal(h.state.design.titleSeparator, " / ");
  assert.equal(h.state.selectedIndex, 0);
  assert.equal(h.calls.renders, 1);
  assert.deepEqual(h.calls.statuses, ["작업 파일을 불러왔습니다."]);
  assert.deepEqual(h.calls.reads, [{ method: "readAsText", encoding: "utf-8" }]);
});
