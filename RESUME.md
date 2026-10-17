# 이어서 작업하기 (RESUME)

> 마지막 업데이트: 2026-10-17 · 재부팅 직전 저장본

## 0. 재부팅 후 딱 두 줄

```powershell
$env:Path = "C:\Users\oocss\tools\node;C:\Users\oocss\tools\git\cmd;$env:Path"
cd "$env:USERPROFILE\Documents\기본 프로젝트\robinson"; npm run dev
```

브라우저에서 **http://localhost:5173** → 화면을 한 번 터치하면 게임 시작.
(타입 검사: `npm run typecheck` / 배포 빌드: `npm run build`)

## 1. 지금 상태 = "돌아가는 프로토타입 v0.1"

- 스택: TypeScript + Phaser 3 + Vite (서버 없음)
- **에셋 정책 변경 (2026-10-17)**: "에셋 0개" 규칙 폐기 → **Blender 3D 렌더 자산 우선, 없으면 코드 생성(Canvas)으로 자동 폴백**. 파이프라인은 `tools/blender/`(지형 렌더 + 프로프 21종 스프라이트), 자산은 `public/`
- PC에서 실행 확인 완료: 타이틀 → 랜덤 섬 생성 → HUD/조이스틱/버튼/미니맵/토스트 표시
- 타입 에러 0개, 개발 서버 정지 완료

## 2. 확정된 게임 규칙 (이번 세션에서 결정)

| 자원 | 규칙 |
|---|---|
| 나무·돌·석유 | Lv.1~10 덩어리, 시간이 지나면 자동 성장, 상위 도구 필요 |
| **수정(crystal)** | **①섬에 처음부터 배치하지 않음 ②하루에 덩어리 1개만 생성 ③캐면 1·9·99개 중 확률 획득(68%/27%/5%) ④성장하지 않음(레벨 고정)** |
| 성장 상한 | 플레이어 최고 도구 등급 × 2 (`familyCap`) → 못 캐는 덩어리 방지 |

## 3. 다음 작업 (우선순위 순)

1. **수정 규칙 구현** ← 방금 확정, 아직 미구현
   - `src/world/island.ts`: 수정 노드 초기 배치 제거 (179·187~192줄 부근)
   - `src/scenes/IslandScene.ts`: `spawnCrystalDrop()` → 하루에 덩어리 **1개**만 생성, `state.crystalDay`로 1일 1회 제한 유지
   - `src/core/config.ts`: `CRYSTAL_DROPS` 가중치(1/9/99)를 **덩어리 캐낼 때** 적용, `CRYSTALS_PER_NODE` 제거
   - 수정 덩어리는 `tickGrowth`/`applyOfflineGrowth` 대상에서 제외 (성장 금지)
2. 스모크 테스트: 제작(🧰)·목표(📜)·메뉴(☰) 모달, 조이스틱 이동, 채집, 밤 습격
3. 자원칩 아이콘 교체(🪵/🪨/🪙는 일부 PC 폰트에서 네모로 표시 → 🌳/⛰️/💰 등 안전한 글리프로)
4. `src/net/cloud.ts` + `supabase/schema.sql` (C안 = 서버리스 BaaS, 선택 사항)
5. `README.md`(빌드/출시 방법) · `DESIGN.md`(구조·로드맵)
6. GitHub Actions로 **APK 클라우드 빌드** → 폰에 직접 설치 테스트

## 4. 출시 비용 결정 (이번 세션 결론)

**Android 먼저 → 반응 좋으면 나중에 iOS.**

| 항목 | 금액 | 시점 |
|---|---|---|
| Supabase | 0원 (무료 티어) | 선택 |
| Google Play 등록 | **$25 1회** | 스토어 출시 직전 |
| Apple Developer | **$99/년** | 나중에 iOS 할 때 |
| APK 직접 설치 테스트 | 0원 | 지금부터 가능 |

- 개인 계정은 출시 전 **테스터 12명 × 14일** 비공개 테스트 필요 (조직 계정이면 면제, D-U-N-S 필요)

## 5. 환경 메모

- Node: `C:\Users\oocss\tools\node` (v24.22.0) · Git: `C:\Users\oocss\tools\git` · VS Code: `%LOCALAPPDATA%\Programs\Microsoft VS Code`
- 관리자 권한 없음 / 8GB RAM / 유니티·에뮬레이터 없음
- 세이브: 브라우저 localStorage 키 `robinson_island_save_v1`
- 프로젝트 경로: `C:\Users\oocss\Documents\기본 프로젝트\robinson`
