# MACH 변경 관리 검증 기록

2026-09-28. 가상 행사·가상 참석자만 신규 검증에 사용했습니다. 기준 main: `93529c71f59110fea464b6c932b9450972446f29` (fetch 후 확인), 깨끗한 main에서 `codex/mach-event-changes` 작업 브랜치를 만들었습니다. 기존 정적 GitHub Pages 파일 구조·운영 주소를 유지합니다.

## 실행한 검증

- 수정 전: `node --test tests/*.test.mjs` — 기존 34개 통과.
- 수정 후: 같은 명령 — 기존 회귀, 세 앱 공통 계약, 명패 변경/출력 모델을 실행. 최종 통과 개수는 릴리스 기록과 실제 명령 출력 참조.
- `tests/browser-regression.cjs` — 독립 Chrome 153.0.8010.53 프로필. 기존 CSV/TSV UTF-8/CP949/EUC-KR, 잘못된 입력 보존, 수동 붙여넣기, JSON 저장·복원, 현재/전체 인쇄, A4 가로 PDF, 모바일 미리보기 모두 통과.
- `tests/mach-browser.cjs` — 로컬 공유 서버와 독립 Chrome 프로필. 수신 취소, 최초 가져오기, 선택 적용·미선택 보존, 개인 표시 충돌 유지/받은 내용 적용, 인쇄 작업 후 이름 변경과 이전 작업 완료, 불참 회수 목록, 부분 출력 양면 두 장짝, 전체 명단·디자인 보존, JSON 저장→초기화→복원, 기존 ID 없는 자료 반복 새로고침 후 ID 유지, 390px·412px 버튼 접근과 가로 넘침, 긴 한글 이름/긴 직책·줄바꿈, 지나치게 긴 글자 인쇄 차단을 확인했습니다.
- 선택 출력 PDF를 생성하고 1페이지 A4 가로(842.88 × 595.92 pt), 위쪽 회전 뒷면/아래쪽 앞면 한 쌍, 한글과 로고, 테두리 잘림 없음을 렌더 이미지로 확인했습니다.
- 신규 브라우저 검증에서 요청 URL·요청 본문·메서드를 수집하여 가상 입력이 URL/본문에 실리지 않으며 GET 외 전송이 없음을 확인했습니다. 기존 Google Analytics 태그를 제거했습니다. 사용자가 별도로 선택하는 기존 메일/이슈 피드백 기능은 이번 명단 전달 검증 경로에 포함되지 않습니다.

```sh
node --test tests/*.test.mjs
NODE_PATH=/path/to/playwright/node_modules node tests/browser-regression.cjs
TEST_URL=http://127.0.0.1:4177/nameplate-maker/ NODE_PATH=/path/to/playwright/node_modules node tests/mach-browser.cjs
```

각 브라우저 스크립트가 출력하는 임시 폴더에 실제 생성 PDF·스크린샷을 보관합니다. 스크린샷과 PDF는 저장소에 commit하지 않습니다. `TEST_URL`은 배포 후 독립 프로필 smoke 검증에도 사용할 수 있습니다.

## 한계와 구분

실제 프린터의 종이 출력·프린터 드라이버, Chrome 외 브라우저는 미검증입니다. 페이지의 명시적 `출력 완료 확인`은 담당자의 실물 확인을 기록하는 기능입니다. 원큐/PRIME과의 전체 창 연결 E2E, commit/PR/merge/배포와 운영 주소 검증은 세 저장소 릴리스 검증 결과로 별도 기록하며 이 문서만으로 완료를 주장하지 않습니다.
