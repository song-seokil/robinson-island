# 작업 방식과 규칙 (WORKFLOW)

> 구축 담당자가 손을 대기 전에 읽는 문서. "어떻게 만들고, 무엇을 하면 안 되는가".
> 무엇을 만들지는 [`../design/GRAYBOX_SPEC.md`](../design/GRAYBOX_SPEC.md), 지금 어디까지 왔는지는 [`ROADMAP.md`](ROADMAP.md).

## 1. 역할 분담

| 장소 | 하는 일 | 못 하는 일 |
|---|---|---|
| **사무실** (UBIVELOX, Unity 없음) | 설계 문서, C# 작성, 프로젝트 설정 편집 | 컴파일 확인, Play 검증 |
| **집** (oocss, Unity 6000.3.26f1) | Unity 열기, Play 검증, `.meta` 생성, 커밋 | — |

S:는 Tailscale 너머 NAS 공유라 파일은 자동으로 양쪽에 보인다. 별도 전송은 없다.

### 사무실에서

1. `ROADMAP.md`에서 현재 마일스톤의 다음 항목을 고른다.
2. 설계 문서 → 코드 순으로 작업한다. 스펙에 `[가정]`인 값은 구현 근거로 쓰지 않는다. 값이 필요한데 스펙에 없으면 `../design/DECISIONS.md`에 올린다.
3. 코드를 끝내면 `HOME_CHECK.md`에 **검증 항목**을 추가한다. 컴파일을 못 보므로 "무엇이 보여야 성공인지"를 적는다.
4. `../../CHANGELOG.md`에 변경을 기록한다.

### 집에서

1. Unity Hub → `S:\02. 송서방\01. 로빈슨 크루소\unity\RobinsonGraybox` 열기.
2. `HOME_CHECK.md`의 미확인 항목부터 처리한다. 실패는 증상을 그대로 적는다.
3. 결과를 `HOME_CHECK.md` 확인 결과 칸과 `CHANGELOG.md`의 `[검증]`에 기록한다.
4. Unity가 만든 `.meta`를 포함해 커밋한다.

## 2. 절대 금지

- **C:에 Unity 프로젝트 또는 `Library` 생성.** 프로젝트/Library는 S:에만 둔다.
- **D:를 유일한 사본으로 사용.** D:는 백업 전용 (`ENVIRONMENT.md` §5).
- **회색박스 통과 전 UI·사운드·메타·멀티 착수.** 아트는 병행 허용 (스펙 §1 아트 병행).
- **코드로 그린 최종 아트.**
- **구 코드(`src/`, `src3d/`) 이식.** 알고리즘·수치를 근거로 쓰지 않는다. 화면 구도 참고만 허용.
- **씬 YAML(`.unity`) 직접 수정.** 런타임 생성이 우선이다.
- **CHANGELOG 없는 변경.**

## 3. 코딩 규칙 (Unity / C#)

사무실에서 컴파일을 확인할 수 없다는 전제에서 나온 규칙이다.

- **보수적 C#만.** 새 언어 기능, 외부 패키지, 에디터 확장을 피한다. Unity 6 API 중 확실한 것만 쓴다.
- **런타임 생성.** `[RuntimeInitializeOnLoadMethod]` 부트스트랩이 Play 시 월드를 만든다. 씬에는 카메라와 조명만 둔다.
- **입력은 새 Input System 전용.** `UnityEngine.InputSystem`의 `Keyboard.current`, `Mouse.current`. 프로젝트 설정 `Active Input Handling = Input System Package (New)`. 구 `Input.GetKey`는 쓰지 않는다.
- **디버그 UI는 IMGUI(`OnGUI`).** 회색박스 단계에서 uGUI 캔버스를 만들지 않는다. 새 Input System 전용 설정과의 호환은 집에서 확인한다 (`HOME_CHECK.md`). 안 되면 설정을 `Both`로 바꾸고 기록한다.
- **런타임 머티리얼.** `Shader.Find`로 만들되 null 폴백을 둔다. 쓰는 셰이더는 `GraphicsSettings`의 Always Included Shaders에 등록한다 (현재 Standard, Unlit/Color).
- **네임스페이스 `Robinson.Graybox`**, 파일당 클래스 1개, `sealed`.
- **상수는 부트스트랩에.** `MapSize = 72`, `PlayableInset = 4`, `TileSize = 1f`. 스펙과 다르면 스펙이 맞다.
- 주석은 스펙 버전을 인용한다. 상수를 바꾸면 주석도 같이 바꾼다.
- 월드 재생성은 `Destroy(old)` 후 새로 만든다. 같은 프레임에 옛 오브젝트가 남아 있으므로 `FindObjectsByType`으로 "이미 있는지" 판단하지 않는다 (옛 것이 잡힌다).

## 4. 프로젝트 규약

### 논리 단위

- **1타일 = 1 Unity 유닛(1m).** 격자 원점 (0,0,0). 타일 (x,z)는 월드 [x, x+1) × [z, z+1).
- 맵 72×72. 플레이 영역은 인셋 4 → [4, 68).
- HQ는 2×2, 중심 (36, 36) = 격자선 위.
- 플레이 그라운드는 **평면 y=0**. 산 높이는 표현일 뿐 판정에 쓰지 않는다.

### 프리팹 구조 (아트 병행용)

```
Unit (루트: 논리 크기 · 콜라이더 · 스크립트)
└─ Visual (자식: 아트 교체 슬롯)
```

- 루트 크기는 아트와 무관하게 고정. 피벗 바닥 중앙, 정면 +Z.
- 무료 모델은 임포트 시 1타일 = 1m로 정규화하고 `unity/RobinsonGraybox/Assets/Art/CREDITS.md`에 출처·라이선스를 적는다. 라이선스 불명 에셋은 쓰지 않는다.
- 회색박스와 아트가 섞여 있어도 동작해야 한다. 일부만 교체 가능해야 한다.

### 폴더

```
unity/RobinsonGraybox/
  Assets/Scenes/SampleScene.unity     카메라·조명만. 수정 금지
  Assets/Scripts/Graybox/             회색박스 코드 (M0~M3)
    GrayboxBootstrap.cs               월드 생성 · 시드 · IMGUI
    GrayboxCamera.cs                  WASD 팬 · 우클릭 회전 · 휠 줌
    GridRenderer.cs                   선 메시 격자
  Assets/Art/                         무료 모델 + CREDITS.md
  Packages/manifest.json              inputsystem 1.20.0, ugui, timeline, visualscripting
  ProjectSettings/                    빌트인 RP, Android minSdk 25, Input System 전용
```

## 5. Git

| 항목 | 값 |
|---|---|
| 저장소 | `S:\02. 송서방\01. 로빈슨 크루소` |
| 브랜치 | `main` 단일 |
| 원격 | `https://github.com/song-seokil/robinson-island.git` |
| 동결 태그 | `archive/web-2d-2026-10` (2D 웹 프로토타입) |

- 커밋 대상: 루트 문서, `docs/`, Unity `Assets/`, `Packages/`, `ProjectSettings/`. `.meta`는 Unity가 만든 뒤 함께 커밋한다.
- 제외: `Library/`, `Temp/`, `Logs/`, `UserSettings/`, `node_modules/`, `dist/`, `.vite-cache/`.
- 커밋 전 체크: `CHANGELOG.md`에 항목이 있는가. 커밋 메시지는 그 항목의 요약.
- 커밋은 **검증이 끝난 집에서** 하는 것이 기본이다. 사무실에서는 문서만 커밋해도 된다.
- S: UNC 경로에서 git이 "dubious ownership"을 내면 `git -c safe.directory=* <명령>`으로 우회한다. 전역 설정은 바꾸지 않는다.
- `core.autocrlf=true`. LF/CRLF 경고는 무시해도 된다.

## 6. 폐기 영역 다루기

- `src/`(Phaser 2D), `src3d/`(Three.js), `public/`, `tools/blender/`, `index*.html`, `package.json`, `vite.config.ts`는 **폐기된 웹 프로토타입**이다. `npm run dev`는 이것을 띄우며 새 게임과 무관하다.
- 삭제하지 않는다 (복구 비용 0, 용량 무시 가능). 수정도 하지 않는다.
- 설계 근거로 쓰지 않는다. 구 설계와 새 설계의 차이는 [`../archive/README.md`](../archive/README.md).
