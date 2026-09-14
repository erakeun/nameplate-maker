# CSV·TSV 인코딩 회귀검증

저장소 루트에서 Node.js 22 이상(full ICU 기본 배포판)으로 실행한다. npm 설치나 앱의 테스트용 export는 필요 없다.

```sh
node --test tests/import-encoding.test.mjs
```

테스트는 `index.html`의 실제 디코딩·파싱·파일 불러오기 함수와 수동 붙여넣기 교체/추가 이벤트를 추출하여 실행한다. `FileReader`와 렌더링·인쇄 호출만 대체해 최종 `state.people`, 선택 상태, 안내 문구와 호출 여부를 검사한다. 실제 브라우저 화면·인쇄 레이아웃 검증은 별도로 실행해야 한다.

| 파일 | 인코딩·형식 | 기대 결과 |
| --- | --- | --- |
| `fixtures/utf8.csv` | UTF-8, CSV, CRLF | 이기정/총장, 김민수/부총장, 한양대학교 로고 |
| `fixtures/utf8-bom.csv` | UTF-8 BOM, CSV, CRLF | 동일 결과, 첫 이름에 BOM 없음 |
| `fixtures/cp949.csv` | CP949/MS949, CSV, CRLF | 동일 결과 |
| `fixtures/euc-kr.csv` | EUC-KR, CSV, CRLF | 동일 결과 |
| `fixtures/utf8-{lf,crlf}.tsv` | UTF-8, TSV, LF/CRLF | 두 이름·직책, 소속 한양대학교 |
| `fixtures/cp949-{lf,crlf}.tsv` | CP949, TSV, LF/CRLF | 동일 결과 |
| `fixtures/cp949-extended.csv` | CP949 확장 한글 | 이름 `갂뷁힣` — 실제 브라우저 검증 대상 |
| `fixtures/quoted-{utf8,cp949}.csv` | 따옴표 CSV | 이름 `이,기정`, 소속 `한양"대학교`, 빈 소속 유지 |

사용자가 제시한 CSV의 네 번째 열은 기존 규칙에 따라 소속이 아니라 좌측 로고이다. 따라서 `한양대학교`는 `logoKey: "hanyang"`으로, 빈 두 번째 열은 `organization: ""`으로 유지한다. 샘플 두 이름은 CP949와 EUC-KR 공통 영역에 속하므로 두 파일의 바이트가 같다. CP949 확장 fixture로 공통 영역 밖도 검증한다.

추가로 ASCII, 유효한 UTF-8에 명시적으로 포함된 U+FFFD, 잘못된 바이트 `FF`, 빈 파일, 파일 읽기 오류, 붙여넣기 교체/추가, 제목 조합과 현재/전체 인쇄 호출, JSON 작업파일의 독립된 UTF-8 `readAsText` 경로를 검사한다. 오류 시 기존 명단과 선택 상태가 유지되는지도 확인한다.

Node.js 22의 ICU 기반 `euc-kr`는 브라우저 WHATWG 매핑과 다른 결과를 낼 수 있다([Node 확인된 버그](https://github.com/nodejs/node/issues/61041)). 특히 CP949 확장 한글과 잘린 선행 바이트 `81`는 Node 결과를 브라우저 결과로 간주하면 안 된다. 이 두 경우는 실제 브라우저에서 반드시 검사한다. `cp949-extended.csv`는 `갂뷁힣`으로 표시되어야 하며, `81` 한 바이트 파일은 `파일의 문자 인코딩을 확인해 주세요.`를 표시하고 기존 명단을 보존해야 한다.

## 수정 전 문제 재현

조사한 원본 main은 `7166324940ff4d8041264c1dcb6d198e1d215260`이다. 다음 명령은 CP949의 이름·직책·로고 매핑이 깨지는 실패를 재현한다. 임시 파일을 환경변수로 지정하므로 작업 중인 `index.html`은 변경하지 않는다.

```sh
git show 7166324940ff4d8041264c1dcb6d198e1d215260:index.html > /tmp/nameplate-import-baseline.html
NAMEPLATE_SOURCE=/tmp/nameplate-import-baseline.html node --test --test-name-pattern='CSV import preserves Korean fields: cp949.csv' tests/import-encoding.test.mjs
```

## Fixture 재생성

실제 업로드할 수 있는 fixture 파일은 저장소에 포함되어 있다. 다시 만들 때만 Python 3가 필요하다.

```sh
python3 tests/generate-fixtures.py
```

## 실제 브라우저 회귀검증

Chrome이 설치된 환경에서 Playwright를 테스트용 임시 디렉터리에 설치한다. 앱의 런타임 의존성이나 GitHub Pages 구조는 변경하지 않는다.

```sh
npm install --prefix /tmp/nameplate-browser-tests playwright@1.62.1
NODE_PATH=/tmp/nameplate-browser-tests/node_modules node tests/browser-regression.cjs
```

스크립트는 임시 로컬 HTTP 서버와 독립된 Chrome 프로필을 사용한다. 실제 파일 업로드 후 화면 입력값·저장 상태·미리보기·인쇄용 DOM을 검증한다. CP949 확장 한글, 잘린 바이트, 따옴표 CSV, 붙여넣기 교체/추가, JSON 저장/복원, 현재/전체 인쇄 호출과 A4 가로 PDF, 모바일 미리보기도 포함한다. PDF·스크린샷은 출력에 표시된 임시 디렉터리에 저장된다. 실제 프린터로 종이를 출력하지는 않는다.

배포 후 같은 검증을 운영 사이트에서 실행할 수 있다. 테스트 프로필의 명단만 바뀌며 분석 수집 요청은 차단한다.

```sh
TEST_URL=https://erakeun.github.io/nameplate-maker/ NODE_PATH=/tmp/nameplate-browser-tests/node_modules node tests/browser-regression.cjs
```

## 구현 근거

- [WHATWG Encoding Standard의 문자 매핑](https://encoding.spec.whatwg.org/#indexes)은 EUC-KR에 Windows Codepage 949 확장 영역을 포함한다. 브라우저에서는 `TextDecoder("euc-kr")`로 CP949/MS949와 EUC-KR을 처리한다.
- [TextDecoder 생성·fatal·BOM 규칙](https://encoding.spec.whatwg.org/#interface-textdecoder)에 따라 `fatal: true`로 잘못된 UTF-8을 예외로 검출하고, 기본 `ignoreBOM: false`로 UTF-8 BOM을 출력에서 제외한다. 문자 자체로 유효하게 인코딩된 U+FFFD는 오류가 아니다.
- [MDN TextDecoder 브라우저 호환성](https://developer.mozilla.org/en-US/docs/Web/API/TextDecoder#browser_compatibility)에서 현행 Chrome, Edge, Firefox, Safari 지원을 확인할 수 있다. 앱에는 외부 디코더 라이브러리를 추가하지 않는다.
