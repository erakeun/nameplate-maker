# 경기대학교 책상용 명패 에디션

진입점: `/kyonggi/`. 학교 공식 서비스가 아닌 사용자 제작 도구입니다.

## 원본 및 분리

- MACH `https://erakeun.github.io/ERICAAI/`의 ‘행사용 명패 생성기’ 링크는 `https://erakeun.github.io/nameplate-maker/`입니다. 목걸이·집게 명찰과 다른 양면 책상 명패입니다.
- 원본: `erakeun/nameplate-maker`, 기준 SHA `1ac5de66cc1a83cde4a2c5281c08b265ddc1d228`.
- 기존 루트 HTML·JS·자산은 변경하지 않았습니다. 공통 명단 연계·검증 JS 3개는 상대 경로로 재사용합니다. 경기대 UI와 출력용 자산은 독립 폴더입니다.
- localStorage: `kyonggi-nameplate-maker-project-v1`, `kyonggi-nameplate-maker-design-v1`. 백업·동시 편집 보호용 부가 키도 전용 프로젝트 키에서 파생됩니다.
- 다운로드 JSON app: `kyonggi-nameplate-maker`. 한양대 명시 app 또는 다른 학교 기본 로고 키를 가진 작업 파일은 거부합니다. 경기대 복구용 내부 백업 JSON은 계속 지원합니다.
- 한양대 의견 수집 `tool=02` 링크를 제거했습니다. 경기대 전용 의견·통계 전송은 연결하지 않았습니다. 기존 MACH 연계는 사용자 동작 기반 원본 기능이며 통계가 아닙니다.
- 명단·소속·직함 예시는 가상입니다. 캠퍼스 주소는 안내 영역에만 표시하며 명패에 자동 인쇄하지 않습니다.

## 공식 자산 재검증 (2026-10-26)

|항목|공식 출처|확인 결과|
|---|---|---|
|UI·시그니처|https://www.kyonggi.ac.kr/www/contents.do?key=5093|국문 좌우조합 PNG 사용|
|로고 원본|https://www.kyonggi.ac.kr/site/www/images/contents/key5093_img03.png|직접 다시 다운로드하여 SHA-256 일치|
|기룡이·색상|https://www.kyonggi.ac.kr/www/contents.do?key=9819|현재 기본형 6종과 HEX 규정 확인|
|캐릭터 원본 ZIP|https://www.kyonggi.ac.kr/downloadContentsFile.do?fileNo=1918&key=9819|직접 다시 다운로드·압축 해제, 1.png–6.png 전부 해시 일치|
|수원캠퍼스|https://www.kyonggi.ac.kr/www/contents.do?key=5146|(16227) 경기도 수원시 영통구 광교산로 154-42|
|서울캠퍼스|https://www.kyonggi.ac.kr/www/contents.do?key=5147|(03746) 서울특별시 서대문구 경기대로 9길 24|

일관성 기준: `erakeun/mail-card-maker`의 `kyonggi/SOURCES.md`, main SHA `6320bb0b81ebcea1ff1d3e1b8f86ab006fec5440`. 로고·기룡이는 그 버전의 7개 파일과 바이트 동일하며 해시는 `assets/original-sha256.json`에 기록했습니다.

기본 색상 `#215292`, 연한 파랑 `#CAE3F6`, 코랄 `#EB7654`, 그린 `#389D89`, 연한 코랄 `#FEF3F2`를 사용합니다. 공식 캐릭터 페이지의 그린 RGB 표기와 HEX는 서로 달라 명시 HEX를 따랐습니다. 밝은 그린 배경은 파생색입니다. 공식 로고·캐릭터 자체는 재색상·반전·자르기 없이 정비례로 표시합니다. 명패 뒷면 전체 180도 회전은 접어서 사용할 양면 출력 기능입니다.

시안은 기본형, 모던 미니멀, 블루 프레임, 코랄 포인트, 그린 가든의 5종입니다. 배경 SVG 4개는 이 도구에서 만든 장식이며 학교 공식 양식이 아닙니다. 공식 이미지 주변은 흰색입니다. 자산 저작권은 경기대학교에 있습니다. 공식 ZIP 배포본의 해상도 한계는 대형 인쇄 시 확인해야 합니다. 사용자 위치·크기 조절 및 외부기관 이미지 추가 후에는 겹침·여백을 확인하세요.

## 검증 및 배포

`tests/kyonggi-browser.cjs`는 독립 headless Chrome과 localhost를 사용하고 모든 외부 요청을 차단합니다. `NODE_PATH`에 Playwright가 있는 환경에서 `node tests/kyonggi-browser.cjs`로 실행합니다. 사용자 Chrome 프로필·탭·마우스를 사용하지 않습니다. 증거와 PDF는 로컬 `test-results/kyonggi/`에 저장됩니다.

main 변경은 GitHub Pages 자동 배포를 유발합니다. 최근 main SHA의 `pages build and deployment` 성공 실행을 확인했습니다. 사용자가 경기대 명패의 커밋·병합·공개 배포를 별도로 승인했습니다. 배포 대상은 기존 `erakeun/nameplate-maker` 저장소의 `/kyonggi/` 추가입니다. 기존 한양대 루트와 공유·권한 설정은 보존합니다.
