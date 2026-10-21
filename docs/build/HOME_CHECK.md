# 집에서 확인할 것

> 사무실에서는 설계·코딩만 한다. Unity 검증은 집에서 한다.
> 확인 후 체크하고, 실패하면 증상을 그대로 적는다.

## M0-1 — 그리드 / 카메라 / HQ (2026-10-21 작성)

- [ ] Unity `6000.3.26f1`로 `unity/RobinsonGraybox` 열기
- [ ] 컴파일 에러 0
- [ ] `Assets/Scenes/SampleScene.unity`에서 Play
- [ ] 72×72 그리드가 보인다
- [ ] 안쪽 밝은 사각형 = 플레이 64×64
- [ ] 중앙에 2×2 HQ 큐브
- [ ] WASD/방향키 이동, 우클릭 드래그 회전, 휠 줌
- [ ] 좌상단 Seed 입력 → `적용` → 월드 재생성
- [ ] FPS 표시

## M0-1 추가 확인 — 사무실 코드 점검에서 나온 항목 (2026-10-21)

- [ ] **Seed 텍스트 입력과 `적용` 버튼이 마우스/키보드에 반응한다.**
  프로젝트가 `Active Input Handling = Input System Package (New)` 전용인데 Seed UI는 IMGUI(`OnGUI`)다.
  에디터에서는 보통 동작하지만, 반응이 없으면 `Edit > Project Settings > Player > Active Input Handling`을 `Both`로 바꾸고 증상을 적는다.
- [ ] **Hierarchy에 Directional Light가 1개만 있다.** (씬의 것 하나. `World` 아래에 또 생기면 안 된다)
- [ ] **Seed를 바꿔 `적용`을 두 번 이상 눌러도 Directional Light가 1개, `World`가 1개다.**
- [ ] 큐브와 그리드가 분홍색(셰이더 누락)이 아니다.
- [ ] `적용` 후 Console에 경고/에러가 없다.

## 확인 결과

> 결과는 여기에 적고, 같은 내용을 `../../CHANGELOG.md`에 `[검증]`으로도 한 줄 남긴다.

- 날짜:
- 결과:
- 에러/증상:
