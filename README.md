# 로빈슨 크루소 — 3D CoC형 장난감 병정 회색박스

> **현재 단계: M0-1 코드 작성 완료, 집 Unity 검증 대기** (2026-10-21)
> 아트는 무료 모델로 병행. UI / 오디오 / 메타 / 멀티는 회색박스 통과 전까지 없다.
> **모든 변경은 [`CHANGELOG.md`](CHANGELOG.md)에 기록한다.**

## 문서 지도

문서는 두 축으로 나뉜다. **설계** = 무엇을 만드는가. **구축** = 어떻게 만들고 검증하는가.

### 설계 — `docs/design/`

| 문서 | 역할 | 언제 보는가 |
|---|---|---|
| [`GRAYBOX_SPEC.md`](docs/design/GRAYBOX_SPEC.md) | **확정 규칙의 단일 출처.** 맵 · 경제 · 약탈 · 시대 · 아트 병행. `[확정]`만 구현 근거 | 구현할 수치가 필요할 때 |
| [`DECISIONS.md`](docs/design/DECISIONS.md) | 미결 항목이 어느 마일스톤을 막는지 + 미승인 제안값 + 결정 기록 | M2 착수 전, 스펙에 없는 값이 필요할 때 |
| [`COC_REFERENCE.md`](docs/design/COC_REFERENCE.md) | CoC 공개 수치 대조표, 관찰 체크리스트, 스펙 리스크 | M2 / M3 튜닝 때 |

### 구축 — `docs/build/`

| 문서 | 역할 | 언제 보는가 |
|---|---|---|
| [`ROADMAP.md`](docs/build/ROADMAP.md) | **현재 위치와 다음 작업.** M0~M3 항목별 체크, 미착수 목록 | 작업을 이어받을 때 **첫 번째** |
| [`WORKFLOW.md`](docs/build/WORKFLOW.md) | 사무실 / 집 역할, 절대 금지, C# 코딩 규칙, 프로젝트 규약, Git | 코드를 쓰기 전 |
| [`HOME_CHECK.md`](docs/build/HOME_CHECK.md) | 집에서 Play로 확인할 항목과 결과 | 집에서, 그리고 코드를 끝낼 때 (항목 추가) |
| [`ENVIRONMENT.md`](docs/build/ENVIRONMENT.md) | 두 기기 사양, Unity / Android SDK, 드라이버, 저장소 정책 | 환경 문제가 생겼을 때 |
| [`CREDITS.md`](unity/RobinsonGraybox/Assets/Art/CREDITS.md) | 무료 모델 출처 · 라이선스 (Unity 프로젝트 안) | 에셋을 넣을 때마다 |

### 이력 — 루트

| 문서 | 역할 |
|---|---|
| [`CHANGELOG.md`](CHANGELOG.md) | **저장소의 모든 변경.** 설계 · 구축 · 문서 · 검증. 변경이 있을 때마다 같은 작업에서 기록 |

### 폐기 — `docs/archive/`

2D 생존 게임 설계(`GAME_DESIGN.md`, `DESIGN.md`)와 비주얼 보드(`boards/`). 현재 설계의 근거로 쓰지 않는다. 왜 폐기했는지는 [`docs/archive/README.md`](docs/archive/README.md).
코드 쪽 폐기 영역(`src/`, `src3d/`, `public/`, `tools/`, `package.json`)은 태그 `archive/web-2d-2026-10`으로 동결. `npm run dev`는 구 프로토타입을 띄운다.

## 시작하기

**사무실 (설계 · 코딩)**

1. `docs/build/ROADMAP.md` §1에서 현재 위치 확인.
2. `docs/build/WORKFLOW.md` §2 ~ §3 규칙 확인.
3. 작업 → `docs/build/HOME_CHECK.md`에 검증 항목 추가 → `CHANGELOG.md` 기록.

**집 (검증)**

1. Unity Hub에서 `S:\02. 송서방\01. 로빈슨 크루소\unity\RobinsonGraybox` 열기 (Unity `6000.3.26f1`).
2. `Assets/Scenes/SampleScene.unity` → Play.
3. `docs/build/HOME_CHECK.md` 미확인 항목 처리 → 결과 기록 → `CHANGELOG.md` `[검증]` → 커밋.

## 절대 규칙 (요약)

- C: 드라이브에 Unity 프로젝트 / `Library`를 만들지 않는다.
- 구 2D 코드와 설계를 이식하거나 근거로 쓰지 않는다.
- 스펙의 `[가정]`은 구현 근거가 아니다.
- 씬 YAML을 직접 수정하지 않는다. 런타임 생성이 우선.
- 변경은 반드시 `CHANGELOG.md`에 남긴다.
