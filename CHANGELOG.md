# 변경 이력 (CHANGELOG)

> **규칙: 이 저장소의 모든 변경은 이 파일에 기록한다. 예외 없음.**
> 문서·설계 결정·코드·프로젝트 설정·환경·에셋 — 무엇이든 바뀌면 **같은 작업에서** 한 줄 이상 적는다.
> 기록이 없는 변경은 없었던 것으로 간주한다. 커밋 전에 이 파일이 갱신되었는지 확인한다.

## 기록 방법

1. 최신 항목이 **맨 위**. 날짜별로 묶는다.
2. 한 줄 형식: `- [분류] 대상 — 무엇을 / 왜`
   - 분류: `설계` (규칙·수치·결정) · `구축` (코드·Unity 설정·환경·도구) · `문서` (구조·정리) · `검증` (집 Play 결과)
   - 대상: 파일 경로 또는 스크립트/클래스 이름
   - 왜: 한 구절이면 충분하다. 이유가 없으면 결정이 아니라 추측이다.
3. `docs/design/GRAYBOX_SPEC.md`의 버전이 오르면(스펙 §5) 여기에도 `[설계] GRAYBOX_SPEC vX.Y` 한 줄을 적는다.
   스펙 내부 이력은 **규칙의 이력**, 이 파일은 **저장소의 이력**이다.
4. 집에서 검증한 결과도 `[검증]`으로 적는다. `docs/build/HOME_CHECK.md`의 체크와 별개로 날짜와 결과를 남긴다.
5. 커밋 메시지는 이 파일의 해당 날짜 항목을 요약한 것이어야 한다.
6. 미승인 제안을 적을 때는 `(미승인)`을 붙인다. 승인되면 `docs/design/DECISIONS.md` 절차를 따른다.

## 2026-10-21

- [문서] 문서 구조 재편 — 루트의 문서를 `docs/design`(설계) / `docs/build`(구축) / `docs/archive`(폐기)로 분리. 구축 관점에서 "무엇을 만들지"와 "어떻게 만들고 검증할지"를 나누기 위해
- [문서] `RESUME.md` 폐지 — 내용을 `docs/build/WORKFLOW.md`(작업 방식·규칙)와 `docs/build/ROADMAP.md`(상태·마일스톤)로 이관
- [문서] `README.md` — 문서 지도와 시작 절차, 절대 규칙 요약만 남김
- [문서] `CHANGELOG.md` 신설 — 모든 변경의 기록 의무화
- [설계] `docs/design/DECISIONS.md` 신설 — 미결 항목이 어느 마일스톤을 막는지, 미승인 제안값, 결정 기록
- [문서] `docs/archive/README.md` 신설 — 폐기 이유와 구/현 설계 차이표 (RESUME §2에서 이관)
- [문서] `design/*.html`(2D 보드 5개) → `docs/archive/boards/` 이동. `docs/design`과 이름 충돌 방지
- [구축] `GrayboxBootstrap.cs` — 씬에 Directional Light가 있으면(`RenderSettings.sun`) 추가 생성하지 않음. 조명 두 겹으로 밝기·FPS 측정이 오염되는 것 방지
- [구축] `GrayboxBootstrap.cs`, `GridRenderer.cs` — `Shader.Find`가 null이면 기본 머티리얼 색만 바꾸는 폴백. 빌드에서 셰이더 제외 시 분홍색 방지
- [구축] `GridRenderer.cs` — Awake 빌드를 Start의 조건부 빌드로 변경. 같은 프레임 이중 빌드 제거
- [구축] `GrayboxBootstrap.cs`, `GridRenderer.cs` — 주석의 64×64/56×56 표기를 실제 상수 72×72/64×64로 수정
- [구축] `ProjectSettings/GraphicsSettings.asset` — Always Included Shaders에 Standard(46), Unlit/Color(10755) 추가. 런타임 생성 머티리얼이 빌드에서 살아남도록
- [구축] `.gitignore` — 깨진 주석 복원(UTF-8)
- [검증] `docs/build/HOME_CHECK.md` — M0-1 추가 확인 5개 (IMGUI 입력 반응, 조명 1개, 재생성 반복, 셰이더, Console)
- [설계] `docs/design/COC_REFERENCE.md` 작성 — CoC 공개 수치 대조표, 관찰 체크리스트 12개, 스펙 리스크 7개, 미승인 제안
- [설계] GRAYBOX_SPEC v0.1 → v0.19 — 3D CoC형 회색박스 스펙 최초 작성과 당일 19회 개정 (자유 드롭·행군 대형·산 큐브 적층·최소 평원·72×72·아트 병행). 상세는 스펙 §5
- [설계] 2D 웹 프로토타입(`src/`, `src3d/`)과 구 설계(`GAME_DESIGN.md`, `DESIGN.md`) **폐기** — 지형 모델이 다름. 태그 `archive/web-2d-2026-10`으로 동결, 물리 삭제 없음
- [구축] Unity `6000.3.26f1` 프로젝트 `unity/RobinsonGraybox` 생성 — 빌트인 파이프라인, 새 Input System 전용, Android minSdk 25
- [구축] M0-1 코드 작성 — `GrayboxBootstrap`, `GrayboxCamera`, `GridRenderer` (72×72 그리드, 플레이 64×64 경계, HQ 2×2, 카메라, IMGUI 시드 입력). **Unity 미검증**
- [구축] `docs/build/ENVIRONMENT.md` — 집/사무실 두 기기 사양, Unity·Android SDK, GPU 드라이버 425.31, D: 외장하드 검사 결과
- [구축] Vite 캐시를 프로젝트 안(`.vite-cache`)으로, 파일 감시를 polling으로 — S: SMB에서 `fs.watch` 불가 (커밋 eee0d20, d81cc70)
- [구축] 빌드 복구 — 타입 오류 5건 (커밋 4878003)

## 2026-10-18 (폐기된 2D/Three.js 프로토타입 — 참고용)

- [구축] Three.js 3D 부트스트랩, 섬 GLB(Draco), 캐릭터 3상태 리그·애니메이션, 메사 산, CoC식 카메라, A* 경로, 스킬북·건설 5종, 철거 모드 (커밋 060dd3e ~ 946e6f0, 18건)
- [설계] GAME_DESIGN.md 18-12 ~ 18-23 — 자연 벽·통행 규격·섬 크기 규약·조작 문법 (전부 폐기)

## 2026-10-17

- [구축] 저장소 시작 — Phaser 3 2D 프로토타입, 3/4 뷰 파이프라인, Blender 에셋 도구 (커밋 d0aa8f9, 00f7157)
