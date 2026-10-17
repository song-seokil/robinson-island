/**
 * 전역 시간 계수 — 슬로모션/히트스톱을 게임 로직 전체에 적용하기 위한 단일 지점.
 * IslandScene.update 에서 dt = delta/1000 * g.factor 로 사용한다.
 */
export const g = {
  factor: 1,          // 1 = 정상, 0.3 = 느리게, 0 = 정지
  fps: 60,
};

let resetHandle: number | null = null;

/** 히트스톱(찰나 정지) — ms 동안 시간 정지 */
export function hitstop(ms: number) {
  if (typeof window === 'undefined') return;
  g.factor = 0;
  if (resetHandle !== null) window.clearTimeout(resetHandle);
  resetHandle = window.setTimeout(() => {
    g.factor = 1;
    resetHandle = null;
  }, ms);
}

/** 슬로모션 — ms 동안 factor 유지 후 복귀 */
export function slowmo(factor: number, ms: number) {
  if (typeof window === 'undefined') return;
  g.factor = factor;
  if (resetHandle !== null) window.clearTimeout(resetHandle);
  resetHandle = window.setTimeout(() => {
    g.factor = 1;
    resetHandle = null;
  }, ms);
}
