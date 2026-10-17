import { BuildId, Cost, Family, ItemKey, LEVEL_MAX, OFFLINE_CAP_HOURS, SAVE_KEY, TOOLS, toolById } from './config';

export interface SavedBuilding { key: BuildId; x: number; y: number; hp: number; }

export interface GameStateData {
  version: number;
  seed: number;
  day: number;
  dayT: number;
  inv: Record<ItemKey, number>;
  tools: string[];              // 보유 도구 id 목록
  raft: number;
  nodeLevel: number[];          // 노드별 레벨 (섬 생성 순서와 1:1)
  nodeProg: number[];           // 노드별 다음 레벨까지 진행도 0..1
  buildings: SavedBuilding[];
  hp: number;
  px: number;
  py: number;
  kills: number;
  raidsWon: number;
  nightsSurvived: number;
  quests: Record<string, boolean>;
  friday: boolean;
  muted: boolean;
  intro: boolean;               // 표류 인트로 연출을 이미 봤는가
  lastSeen: number;             // 마지막 저장 시각 (오프라인 성장용)
  crystalDay: number;           // 마지막 수정 낙하 day
  extras: [string, number, number][];   // 수정 낙하 등으로 추가된 노드 [kind, x, y]
}

function blankInv(): Record<ItemKey, number> {
  return { wood: 0, stone: 0, oil: 0, crystal: 0, food: 0, meal: 0 };
}

function fresh(seed = Math.floor(Math.random() * 1e9)): GameStateData {
  return {
    version: 2,
    seed,
    day: 1,
    dayT: 0.05,
    inv: blankInv(),
    tools: [],
    raft: 0,
    nodeLevel: [],
    nodeProg: [],
    buildings: [],
    hp: 100,
    px: 0,
    py: 0,
    kills: 0,
    raidsWon: 0,
    nightsSurvived: 0,
    quests: {},
    friday: false,
    muted: false,
    intro: false,
    lastSeen: Date.now(),
    crystalDay: 0,
    extras: [],
  };
}

export const state: GameStateData = fresh();

export function loadSave(): boolean {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return false;
    const d = JSON.parse(raw) as GameStateData;
    if (!d || typeof d.seed !== 'number') return false;
    Object.assign(state, fresh(d.seed), d);
    for (const k of Object.keys(blankInv()) as ItemKey[]) {
      if (typeof state.inv[k] !== 'number') state.inv[k] = 0;
    }
    if (!Array.isArray(state.tools)) state.tools = [];
    if (!Array.isArray(state.nodeLevel)) state.nodeLevel = [];
    if (!Array.isArray(state.nodeProg)) state.nodeProg = [];
    if (!Array.isArray(state.extras)) state.extras = [];
    return true;
  } catch {
    return false;
  }
}

export function saveGame() {
  state.lastSeen = Date.now();
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(state));
  } catch { /* 저장 실패 무시 */ }
}

export function hasSave(): boolean {
  try { return !!localStorage.getItem(SAVE_KEY); } catch { return false; }
}

export function resetSave(newSeed?: number) {
  Object.assign(state, fresh(newSeed ?? Math.floor(Math.random() * 1e9)));
  saveGame();
}

// ============================================================
// 인벤토리
// ============================================================
export function addItem(k: ItemKey, n: number) {
  state.inv[k] = (state.inv[k] ?? 0) + n;
}

export function count(k: ItemKey): number { return state.inv[k] ?? 0; }

export function canAfford(cost: Cost): boolean {
  for (const k of Object.keys(cost) as ItemKey[]) {
    if (count(k) < (cost[k] ?? 0)) return false;
  }
  return true;
}

export function pay(cost: Cost): boolean {
  if (!canAfford(cost)) return false;
  for (const k of Object.keys(cost) as ItemKey[]) {
    state.inv[k] = count(k) - (cost[k] ?? 0);
  }
  return true;
}

export function missingText(cost: Cost): string {
  const out: string[] = [];
  for (const k of Object.keys(cost) as ItemKey[]) {
    const need = cost[k] ?? 0;
    const have = count(k);
    if (have < need) out.push(`${k} -${need - have}`);
  }
  return out.join(' ');
}

// ============================================================
// 도구 / 레벨 게이팅
// ============================================================
export function hasTool(id: string): boolean { return state.tools.includes(id); }

export function giveTool(id: string) {
  if (!state.tools.includes(id)) state.tools.push(id);
}

/** 해당 계열에서 보유한 최고 도구 단계 (1 = 맨손) */
export function familyTier(f: Family): number {
  let tier = 1;
  for (const id of state.tools) {
    const t = toolById(id);
    if (t && t.family === f && t.tier > tier) tier = t.tier;
  }
  return tier;
}

/** 해당 계열 노드가 성장할 수 있는 최대 레벨 (도구 단계에 비례) */
export function familyCap(f: Family): number {
  return Math.min(LEVEL_MAX, familyTier(f) * 2);
}

/** 도구의 채집 1회 피해량 */
export function toolPower(f: Family): number {
  return Math.max(1, familyTier(f));
}

export function nextToolFor(f: Family) {
  const tier = familyTier(f);
  return TOOLS.find((t) => t.family === f && t.tier === tier + 1);
}

// ============================================================
// 노드 성장 (실시간 / 오프라인)
// ============================================================
export function ensureNodeArrays(n: number) {
  if (state.nodeLevel.length !== n) {
    const lv: number[] = [], pr: number[] = [];
    for (let i = 0; i < n; i++) {
      lv.push(state.nodeLevel[i] ?? 1);
      pr.push(state.nodeProg[i] ?? 0);
    }
    state.nodeLevel = lv;
    state.nodeProg = pr;
  }
}

/** 오프라인 경과 시간(초, 상한 적용) */
export function offlineSeconds(): number {
  const last = state.lastSeen || Date.now();
  const el = (Date.now() - last) / 1000;
  return Math.max(0, Math.min(el, OFFLINE_CAP_HOURS * 3600));
}
