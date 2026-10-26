# 로컬 검증 결과 — 2026-10-26

## 실행 환경과 변경 범위

- 독립 clone: `C:\Users\HR0122\Documents\Codex\2026-10-26\task-12\nameplate-maker`
- 브랜치: `codex/kyonggi-nameplate-local`; HEAD `1ac5de66cc1a83cde4a2c5281c08b265ddc1d228`.
- 기존 추적 파일 diff 0. 추가 파일만 있음: `.gitignore`, `kyonggi/`, `tests/kyonggi-browser.cjs`.
- 저장소와 적용되는 상위 폴더에서 AGENTS.md 및 `.agents/skills`를 확인했으며 적용 가능한 파일은 없었습니다. 다른 작업의 지침·파일은 수정하지 않았습니다.
- 전용 headless Chrome 155.0.8059.85, 임시 프로필·localhost 서버. 사용자 탭·앱·마우스 미사용. 경기대 테스트는 외부 요청을 모두 차단하고 요청 수 0을 확인했습니다.

## 통과한 검증

1. 기존 Node 회귀 테스트 72/72 통과 (`node --test tests/*.test.mjs`).
2. 기존 `tests/browser-regression.cjs` 전체 통과: UTF-8/BOM/CP949/EUC-KR/CSV/TSV, 잘못된 파일 보호, 일괄 입력, JSON 저장 복원, 페이지 전환, 현재/전체 인쇄, A4 PDF, 모바일, JS 오류 없음.
3. 경기대 `tests/kyonggi-browser.cjs` 전체 통과:
   - 공식 기룡이 1–6 각각 로드, 경기대 로고, 좌측/하단 숨김.
   - 일괄 교체·추가 및 기룡이 이름 해석.
   - 이름·직함 크기, 위치, 글자색 조절 및 저장.
   - 실제 다운로드 JSON 다시 읽기·재가져오기, 새로고침 복원.
   - 한양대 app 작업 파일 거부 및 기존 경기대 상태 보존.
   - 긴 이름 ‘홍길동가상긴이름’, 긴 소속·직함을 200×70 / 200×80 / 250×80 / 255×85mm에서 확인. 자동 맞춤 후 넘침 경고 없음.
   - 사용자 지정 240×75mm.
   - 시안 5개 화면 캡처 및 현재 1장 인쇄 PDF, 전체 2명 인쇄 PDF.
   - 모바일 390×844에서 미리보기 열기/닫기, 수평 넘침 없음.
   - 같은 origin에서 기존 한양대 저장 데이터 그대로 유지, 한양대 화면 로고 정상.
   - 출력 이미지 경로가 경기대 폴더 자산만 참조, 외부 요청 0, JS 오류 0.
4. PDF 6개를 pypdf로 다시 열고 A4 가로 약 841.92×594.96pt 및 페이지 수 검증. 시안별 1페이지, 전체 2페이지. 한국어 텍스트 추출 정상.
5. PDF를 Poppler로 다시 PNG 렌더링하고 직접 시각 검토. 양면 회전, 공식 이미지 비율, 글자·이름·로고, 5개 시안 및 긴 문구 화면 확인. 잘림·깨진 글자·한양대 출력 자산 없음.
6. 공식 로고와 기룡이 ZIP을 다시 다운로드하여 원본 PNG 7개의 SHA-256 모두 메일 명함 기준 버전과 일치.

## 증거 경로

저장소 루트의 `test-results/kyonggi/` (gitignore, 로컬 검토용):

- `gallery.html`: 다섯 시안과 PDF 링크
- `design-basic|minimal|frame|gold|geometric.png`: 실제 앱 미리보기
- `design-*.pdf`, `design-*-reopened.png`: 인쇄 PDF 및 재열기 렌더
- `all.pdf`, `all-reopened-1.png`, `all-reopened-2.png`: 2명 전체 인쇄
- `long-200x70.png`, `long-200x80.png`, `long-250x80.png`, `long-255x85.png`: 긴 문구
- `desktop.png`, `mobile.png`, `saved-project.json`, `results.json`, `pdf-reopened.json`
- 기존 한양대: `test-results/hanyang/`의 화면 및 현재/전체 PDF

## 남은 단계

구현·로컬 검증 차단 없음. 실제 프린터로 100mm 눈금·출력 배율을 물리적으로 재는 단계는 실행하지 않았습니다. 사용자가 로고를 극단적으로 이동하거나 사용자 이미지를 올리는 경우의 최종 배치는 직접 확인해야 합니다.

로컬 검증 후 사용자가 커밋·push·draft PR·merge·공개 배포를 별도로 승인했습니다. 대상은 기존 `erakeun/nameplate-maker`의 `kyonggi/` 진입점 추가이며, main 병합 시 GitHub Pages가 자동 배포됩니다. 새 저장소·공유·권한 변경 없음. 자동 승인 검토 거부는 없었습니다. 초기 샌드박스 localhost 차단은 승인된 별도 headless 테스트 실행으로 해결했습니다.
