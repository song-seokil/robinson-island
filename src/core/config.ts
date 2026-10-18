/**
 * 게임 전역 설정 — 밸런스 수치는 전부 이 파일에서 관리한다.
 *
 * 핵심 설계
 *  - 파도에 떠밀려 해변에 표류하며 시작, 섬은 매번 새로 랜덤 생성
 *  - 자원은 4종: 나무 / 돌 / 석유 / 수정
 *  - 자원 덩어리는 Lv.1 ~ Lv.10, 시간이 지나면 스스로 다음 레벨로 "성장"
 *  - 높은 레벨은 상위 도구가 있어야 캘 수 있다
 *  - 수정은 섬에 미리 배치되지 않고, 하루에 1개만 나타나며 캐내면 1 / 9 / 99개가 나온다
 *  - 생존: 에너지(먹어야 유지) + 체온(밤에는 불을 피워야 유지)
 *  - 하루에 낮·밤이 두 번 돈다 (한 바퀴 = DAY_SECONDS / CYCLES_PER_DAY)
 *  - 표류하며 주운 책 2권(요리책·기계공학책)을 공부해야 도구·레시피가 열린다
 *  - 제작에는 시간이 걸리고, 숙련도가 오르면 빨라진다 (스킬트리로 더 단축)
 */

// ---------- 월드 ----------
export const TILE = 32;
export const MAP_TILES = 56;   // 18-14: CoC 섬 크기(≈1,200타일)에 맞춘 맵 (빈 바다 63%)
export const WORLD_W = TILE * MAP_TILES;
export const WORLD_H = TILE * MAP_TILES;

// ---------- 3/4 뷰 투영 (Blender 렌더와 동일한 카메라) ----------
// 게임 안 좌표는 지상(탑다운) 기준 그대로. 화면에 그릴 때만 아래처럼 눕혀 그린다.
//   화면 y = y · sin(elev) − 고도(h타일) · TILE · cos(elev)
// · 지형 PNG(블렌더 렌더)와 스프라이트(47° 렌더)가 이 식 기준으로 정확히 맞는다
export const VIEW_ELEV = (47 * Math.PI) / 180;
export const PROJ_SIN = Math.sin(VIEW_ELEV);   // ≈0.731
export const PROJ_COS = Math.cos(VIEW_ELEV);   // ≈0.682
export const VIEW_H = WORLD_H * PROJ_SIN;     // 화면에서 실제로 차지하는 높이

/** 월드(지상) y → 화면 y */
export function projY(y: number): number { return y * PROJ_SIN; }
/** 고도 h(타일)를 화면 오프셋으로 — 스프라이트가 지면에 서도록 */
export function projLift(h: number): number { return h * TILE * PROJ_COS; }

// ---------- 시간 ----------
export const DAY_SECONDS = 170;        // 하루(초) — 이 안에 낮·밤이 두 번 온다
export const CYCLES_PER_DAY = 2;       // 하루 = 낮/밤 한 바퀴 × 2
export const NIGHT_FROM = 0.66;        // 한 바퀴 중 밤이 시작되는 비율

// ---------- 생존 ----------
export const PLAYER_HP = 100;
export const PLAYER_SPEED = 152;
export const ENERGY_MAX = 100;
export const ENERGY_DRAIN = 0.62;      // 초당 (하루에 한 번은 먹어야 한다)
export const STARVE_DPS = 1.0;         // 에너지 0일 때 초당 피해
export const WARMTH_MAX = 100;
export const WARMTH_NIGHT_DRAIN = 2.6; // 밤에 초당 빠지는 체온
export const WARMTH_DAY_REGEN = 7;     // 낮에 초당 회복
export const WARMTH_FIRE_REGEN = 15;   // 불 근처에서 초당 회복
export const COLD_DPS = 1.2;           // 체온 0일 때 초당 피해
export const COLD_SLOW = 0.15;         // 체온 0일 때 이동 감소
export const EAT_COOLDOWN = 1.2;       // 연속 먹기 방지(초)

// ---------- 낚시 ----------
export const FISH_TIME = 4.5;          // 낚시 채널 시간(초)
export const FISH_FAIL = 0.18;         // 실패(놓침) 확률
export const FISH_MIN = 1, FISH_MAX = 3;
export const FISH_RANGE = 120;         // 물가에서 이 거리 안이어야 낚시 가능

// ---------- 팔레트 ----------
export const C = {
  waterDeep: 0x0f3350,
  water: 0x1a527a,
  waterLight: 0x2b7bad,
  sandDark: 0xcbb075,
  sand: 0xe0cb98,
  sandLight: 0xf0e0b8,
  grassDark: 0x3a7448,
  grass: 0x4b8a53,
  grassLight: 0x5c9c62,
  jungle: 0x2b6a3d,
  leaf: 0x3f9b52,
  leafDark: 0x276840,
  rock: 0x8b8f95,
  rockDark: 0x6f747a,
  wood: 0x8a5a33,
  bark: 0x5d3b21,
  stone: 0x9aa0a6,
  oil: 0x2b2b30,
  oilSheen: 0x5a5a72,
  crystal: 0x67e4ff,
  crystalDeep: 0x2aa8d8,
  gold: 0xffc94d,
  food: 0xd08a4a,
  red: 0xd9534f,
  green: 0x5bc236,
  ui: 0x0e1620,
  uiLight: 0x1b2836,
  white: 0xffffff,
} as const;

// ============================================================
// 아이템 — 자원 4종 + 식량(생존)
// ============================================================
export type ItemKey = 'wood' | 'stone' | 'oil' | 'crystal' | 'food' | 'meal';

export interface ItemDef {
  name: string;
  icon: string;
  color: number;
  core?: boolean;      // 자원 4종 (HUD 상단 고정)
  food?: boolean;      // 먹을 수 있다
  energy?: number;     // 먹으면 회복되는 에너지
  warmth?: number;     // 먹으면 오르는 체온
}

export const ITEMS: Record<ItemKey, ItemDef> = {
  // 아이콘은 폰트 호환성이 높은 글리프를 쓴다 (🪵·🪨·🪙 같은 신규 이모지는 구형 기기에서 네모로 보인다)
  wood:    { name: '나무', icon: '🌳', color: C.wood,    core: true },
  stone:   { name: '돌',   icon: '⛰️', color: C.stone,   core: true },
  oil:     { name: '석유', icon: '🛢️', color: C.oilSheen, core: true },
  crystal: { name: '수정', icon: '💎', color: C.crystal, core: true },
  food:    { name: '식량', icon: '🍖', color: C.food,    food: true, energy: 18, warmth: 4 },
  meal:    { name: '요리', icon: '🍲', color: C.gold,    food: true, energy: 44, warmth: 14 },
};

export const CORE_ITEMS: ItemKey[] = ['wood', 'stone', 'oil', 'crystal'];
export const FOOD_ITEMS: ItemKey[] = ['meal', 'food'];

export type Cost = Partial<Record<ItemKey, number>>;

// ============================================================
// 자원 계열 / 레벨 / 도구
// ============================================================
export type Family = 'wood' | 'stone' | 'oil' | 'crystal' | 'food';

export interface FamilyDef {
  name: string;
  item: ItemKey;        // 대표 산출물
  icon: string;
  color: number;
}

export const FAMILIES: Record<Family, FamilyDef> = {
  wood:    { name: '목재', icon: '🌳', item: 'wood',    color: C.wood },
  stone:   { name: '석재', icon: '⛰️', item: 'stone',   color: C.stone },
  oil:     { name: '석유', icon: '🛢️', item: 'oil',     color: C.oilSheen },
  crystal: { name: '수정', icon: '💎', item: 'crystal', color: C.crystal },
  food:    { name: '먹거리', icon: '🍖', item: 'food',  color: C.food },
};

export const LEVEL_MAX = 10;

/** 레벨 → 필요 도구 단계 (Lv1-2: 1=맨손, Lv3-4: 2, Lv5-6: 3, Lv7-8: 4, Lv9-10: 5) */
export function requiredTier(level: number, family: Family): number {
  if (family === 'food') return 1;                 // 먹거리는 맨손으로 딴다
  const base = Math.ceil(level / 2);
  // 수정은 한 단계 높은 도구를 요구한다 (귀중 자원)
  return family === 'crystal' ? Math.min(5, base + 1) : base;
}

/** 레벨별 필요 도구 단계(1~5)를 사람이 읽는 이름으로 */
export const TIER_NAMES = ['맨손', '돌 도구', '수정 도구', '동력 도구', '결정 동력 도구'];

/**
 * 생존자 외형 — 도구 단계(1~5)에 따라 달라진다.
 * 그림은 3장(난파 · 1일차 · 적응완료)이고, 단계가 오르면 외형 상태가 넘어간다.
 * (3D 전환 후에는 같은 3장을 3D 모델 기준으로 삼고 장비는 액세서리로 붙인다)
 */
export const PLAYER_SKINS = [
  { tex: 'robinson_wreck', stage: '표류', desc: '해변에 쓰러져 있던 것을 깨어난 사람' },
  { tex: 'robinson_day1', stage: '개척', desc: '찢긴 셔츠와 지팡이, 첫 번째 쉐터' },
  { tex: 'robinson_day1', stage: '수정', desc: '돌 창과 가죽 갑옷' },
  { tex: 'robinson_settled', stage: '동력', desc: '곰모기 어깨갑옷과 사냥총' },
  { tex: 'robinson_settled', stage: '지배자', desc: '섬을 완전히 다스린 사람' },
] as const;

/** 레벨별 체력(스윙 수) — 상위 도구는 한 방 피해가 커서 더 빨리 캔다 */
export function nodeHp(level: number): number {
  return 2 + level;
}

/** 레벨별 산출량 배수 */
export function nodeYieldMult(level: number): number {
  return 1 + (level - 1) * 0.45;
}

/** 다음 레벨까지 성장 시간(초) — 실제 시간 기준(오프라인 성장 포함) */
export function growthSeconds(level: number): number {
  return 40 * Math.pow(1.28, level - 1);   // Lv1→2: 40s ... Lv9→10: 약 6분
}

/** 오프라인 성장 최대 반영 시간 */
export const OFFLINE_CAP_HOURS = 8;

export interface ToolDef {
  id: string;
  family: Family;
  tier: number;             // 2..5
  name: string;
  icon: string;
  cost: Cost;
  desc: string;
  unlock?: string;          // 이 챕터를 공부해야 만들 수 있다
  rod?: boolean;            // 낚시 도구
}

/** 도구 3계열 × 4단계 (tier2~5). tier1 = 맨손 */
export const TOOLS: ToolDef[] = [
  // --- 도끼(목재) ---
  { id: 'axe2', family: 'wood', tier: 2, name: '돌 도끼',       icon: '⚒️', cost: { wood: 3, stone: 2 },              unlock: 'mech1', desc: 'Lv.3~4 나무 채집' },
  { id: 'axe3', family: 'wood', tier: 3, name: '수정 도끼',     icon: '⚒️', cost: { wood: 8, crystal: 2 },             unlock: 'mech3', desc: 'Lv.5~6 나무 채집' },
  { id: 'axe4', family: 'wood', tier: 4, name: '동력 도끼',     icon: '⚙️', cost: { wood: 14, stone: 10, oil: 5 },     unlock: 'mech4', desc: 'Lv.7~8 나무 채집' },
  { id: 'axe5', family: 'wood', tier: 5, name: '결정 동력 도끼', icon: '⚙️', cost: { wood: 20, crystal: 6, oil: 12 },   unlock: 'mech5', desc: 'Lv.9~10 나무 채집' },
  // --- 곡괭이(석재 + 수정) ---
  { id: 'pick2', family: 'stone', tier: 2, name: '돌 곡괭이',     icon: '⛏️', cost: { wood: 3, stone: 3 },            unlock: 'mech1', desc: 'Lv.3~4 돌 · 수정 채집' },
  { id: 'pick3', family: 'stone', tier: 3, name: '수정 곡괭이',   icon: '⛏️', cost: { wood: 8, crystal: 2 },           unlock: 'mech3', desc: 'Lv.5~6 돌 · 수정 채집' },
  { id: 'pick4', family: 'stone', tier: 4, name: '동력 곡괭이',   icon: '🛠️', cost: { stone: 16, oil: 5 },             unlock: 'mech4', desc: 'Lv.7~8 돌 · 수정 채집' },
  { id: 'pick5', family: 'stone', tier: 5, name: '결정 동력 곡괭이', icon: '🛠️', cost: { stone: 22, crystal: 6, oil: 12 }, unlock: 'mech5', desc: 'Lv.9~10 돌 · 수정 채집' },
  // --- 채유기(석유) ---
  { id: 'pump2', family: 'oil', tier: 2, name: '나무 채유기',   icon: '🚰', cost: { wood: 6, stone: 4 },              unlock: 'mech2', desc: 'Lv.3~4 석유 채집' },
  { id: 'pump3', family: 'oil', tier: 3, name: '수정 채유기',   icon: '🚰', cost: { wood: 10, crystal: 3 },            unlock: 'mech3', desc: 'Lv.5~6 석유 채집' },
  { id: 'pump4', family: 'oil', tier: 4, name: '동력 채유기',   icon: '⛽', cost: { wood: 14, stone: 12, crystal: 4 }, unlock: 'mech4', desc: 'Lv.7~8 석유 채집' },
  { id: 'pump5', family: 'oil', tier: 5, name: '결정 채유기',   icon: '⛽', cost: { wood: 20, stone: 20, crystal: 8 },  unlock: 'mech5', desc: 'Lv.9~10 석유 채집' },
  // --- 낚시 도구 ---
  { id: 'rod2', family: 'food', tier: 2, name: '낚시 도구',     icon: '🎣', cost: { wood: 6, stone: 2 },              unlock: 'mech2', rod: true, desc: '물가에서 물고기를 잡는다' },
];

export function toolById(id: string): ToolDef | undefined {
  return TOOLS.find((t) => t.id === id);
}

// ============================================================
// 제작 / 건설 — 전부 "시간"이 걸린다 (숙련도·스킬로 단축)
// ============================================================
export type CraftCat = 'tool' | 'build' | 'cook';

export type RecipeId =
  | 'spear' | 'bow' | 'campfire' | 'wall' | 'tower' | 'spikes' | 'raft'
  | 'grill' | 'stew' | 'feast';

export type BuildId = 'campfire' | 'wall' | 'tower' | 'spikes' | 'raft' | 'chest' | 'hut';

export interface Recipe {
  id: RecipeId;
  name: string;
  icon: string;
  kind: 'survival' | 'build' | 'cook' | 'goal';
  cat: CraftCat;
  cost: Cost;
  give?: Cost;          // 완성 시 받는 아이템 (요리 등)
  time: number;         // 기본 제작 시간(초)
  desc: string;
  build?: BuildId;
  unlock?: string;      // 이 챕터를 공부해야 열린다
  once?: boolean;
}

/** 공부 없이 처음부터 아는 것 (생존 기본) */
export const BASE_UNLOCKS: string[] = ['campfire', 'spear'];

export const RECIPES: Recipe[] = [
  // --- 생존/건설 ---
  { id: 'campfire', name: '모닥불',    icon: '🔥', kind: 'build',    cat: 'build', cost: { wood: 8, stone: 4 },  time: 8,  build: 'campfire', desc: '밤 추위를 막고 요리한다' },
  { id: 'spear',    name: '사냥 창',   icon: '🔱', kind: 'survival', cat: 'tool',  cost: { wood: 5 },              time: 6,  desc: '공격력 +8, 사거리 증가 (사냥)' },
  { id: 'wall',     name: '팔리사드',  icon: '🧱', kind: 'build',    cat: 'build', cost: { wood: 5 },              time: 5,  build: 'wall',   unlock: 'mech1', desc: '적 이동 차단 (HP 90)' },
  { id: 'bow',      name: '단궁',      icon: '🏹', kind: 'survival', cat: 'tool',  cost: { wood: 6, stone: 2 },    time: 12, unlock: 'mech2', desc: '원거리 자동사격 (12 피해)' },
  { id: 'spikes',   name: '가시 함정', icon: '🕳️', kind: 'build',    cat: 'build', cost: { wood: 3, stone: 4 },    time: 8,  build: 'spikes', unlock: 'mech3', desc: '밟으면 26 피해' },
  { id: 'tower',    name: '감시탑',    icon: '🗼', kind: 'build',    cat: 'build', cost: { stone: 12, wood: 6, crystal: 1 }, time: 18, build: 'tower', unlock: 'mech4', desc: '자동 사격 방어 (HP 170)' },
  { id: 'raft',     name: '뗏목',      icon: '🛶', kind: 'goal',     cat: 'build', cost: { wood: 20, stone: 12 },  time: 30, build: 'raft',   unlock: 'mech4', desc: '3척 완성 → 섬 탈출 엔딩' },
  // --- 요리책 (불 근처에서만 만들 수 있다) ---
  { id: 'grill',    name: '생선구이',  icon: '🐟', kind: 'cook', cat: 'cook', cost: { food: 2, wood: 1 },  give: { meal: 1 }, time: 5,  unlock: 'cook1', desc: '식량 2 + 나무 1 → 요리 1' },
  { id: 'stew',     name: '섬 스튜',   icon: '🍲', kind: 'cook', cat: 'cook', cost: { food: 3, oil: 1 },   give: { meal: 2 }, time: 9,  unlock: 'cook2', desc: '식량 3 + 석유 1 → 요리 2' },
  { id: 'feast',    name: '표류자의 만찬', icon: '🍱', kind: 'cook', cat: 'cook', cost: { food: 4, meal: 2 }, give: { meal: 4 }, time: 16, unlock: 'cook3', desc: '요리 2 + 식량 4 → 요리 4' },
];

// ============================================================
// 숙련도 — 제작할수록 오르고, 오르면 제작 시간이 줄어든다
// ============================================================
export const PROF_XP_STEPS = [0, 40, 110, 220, 380];   // 누적 XP → 숙련도 Lv.0~4
export const PROF_TIME_REDUCE = 0.10;                  // 숙련도 1레벨당 -10%

export function profLevel(xp: number): number {
  let lv = 0;
  for (let i = 0; i < PROF_XP_STEPS.length; i++) if (xp >= PROF_XP_STEPS[i]) lv = i;
  return lv;
}

export function profXpFor(recipe: Recipe): number {
  return Math.round(6 + recipe.time * 1.6);
}

// ============================================================
// 책 — 표류할 때 주운 두 권. 공부해야 레시피/도구가 열린다
// ============================================================
export interface BookDef { id: 'mech' | 'cook'; name: string; icon: string; desc: string; }
export const BOOKS: BookDef[] = [
  { id: 'mech', name: '기계공학책', icon: '📘', desc: '도구 · 건축 · 기계. 표류자의 생존 기술' },
  { id: 'cook', name: '요리책',     icon: '📕', desc: '불과 재료로 끼니를 만드는 법' },
];

export interface Chapter {
  id: string;
  book: 'mech' | 'cook';
  name: string;
  desc: string;
  study: number;        // 공부 시간(초)
  req?: string;         // 선행 챕터
  unlocks: string[];    // 해금되는 도구/레시피 id
}

export const CHAPTERS: Chapter[] = [
  { id: 'mech1', book: 'mech', name: '1장 · 돌과 나무',   desc: '돌 도구 · 팔리사드', study: 14, unlocks: ['axe2', 'pick2', 'wall'] },
  { id: 'mech2', book: 'mech', name: '2장 · 그물과 통',   desc: '낚시 도구 · 채유기 · 단궁', study: 20, req: 'mech1', unlocks: ['rod2', 'pump2', 'bow'] },
  { id: 'mech3', book: 'mech', name: '3장 · 수정의 빛',   desc: '수정 도구 · 가시 함정', study: 28, req: 'mech2', unlocks: ['axe3', 'pick3', 'pump3', 'spikes'] },
  { id: 'mech4', book: 'mech', name: '4장 · 동력과 뗏목', desc: '동력 도구 · 감시탑 · 뗏목', study: 40, req: 'mech3', unlocks: ['axe4', 'pick4', 'pump4', 'tower', 'raft'] },
  { id: 'mech5', book: 'mech', name: '5장 · 결정 기관',   desc: '최상위 도구', study: 55, req: 'mech4', unlocks: ['axe5', 'pick5', 'pump5'] },
  { id: 'cook1', book: 'cook', name: '1장 · 불 위에서',   desc: '생선구이', study: 10, unlocks: ['grill'] },
  { id: 'cook2', book: 'cook', name: '2장 · 한 냄비 가득', desc: '섬 스튜', study: 22, req: 'cook1', unlocks: ['stew'] },
  { id: 'cook3', book: 'cook', name: '3장 · 표류자의 만찬', desc: '만찬', study: 34, req: 'cook2', unlocks: ['feast'] },
];

// ============================================================
// 스킬트리 — 스킬 포인트로 영구 강화
// ============================================================
export interface SkillDef {
  id: string;
  name: string;
  icon: string;
  desc: string;
  cost: number;
  req?: string;
}

export const SKILLS: SkillDef[] = [
  { id: 'gather',  name: '채집의 손길', icon: '⛏️', desc: '채집 속도 +30%', cost: 1 },
  { id: 'gather2', name: '도구 다루기', icon: '⛏️', desc: '채집 속도 +30% 추가', cost: 2, req: 'gather' },
  { id: 'move',    name: '민첩한 발',   icon: '👟', desc: '이동 속도 +12%', cost: 1 },
  { id: 'hp',      name: '강인한 몸',   icon: '❤️', desc: '최대 체력 +25', cost: 1 },
  { id: 'energy',  name: '절약하는 위', icon: '🍽️', desc: '에너지 소모 -25%', cost: 2 },
  { id: 'warm',    name: '불꽃 친화',   icon: '🔥', desc: '불 근처 체온 회복 +60%', cost: 2 },
  { id: 'craft',   name: '손재주',      icon: '🧰', desc: '제작 시간 -15%', cost: 1 },
  { id: 'craft2',  name: '대장장이의 손', icon: '🔨', desc: '제작 시간 -15% 추가', cost: 2, req: 'craft' },
  { id: 'study',   name: '집중력',      icon: '📖', desc: '공부 시간 -25%', cost: 2 },
  { id: 'hunt',    name: '사냥꾼',      icon: '🏹', desc: '공격력 +20%', cost: 2 },
  { id: 'fish',    name: '어부의 눈',   icon: '🎣', desc: '낚시 성공량 +1', cost: 2, req: 'study' },
  { id: 'night',   name: '밤눈',        icon: '🌙', desc: '밤 시야가 밝아진다', cost: 1 },
];

// ============================================================
// 건물
// ============================================================
export interface BuildDef {
  name: string; icon: string; hp: number; radius: number; blocks: boolean;
  w?: number; h?: number;
  dmg?: number; range?: number; cd?: number;
  heal?: number; healRange?: number;
  touchDmg?: number;
  tex: string;
}

export const BUILD_DEFS: Record<BuildId, BuildDef> = {
  campfire: { name: '모닥불',   icon: '🔥', hp: 70,  radius: 20, blocks: false, heal: 2.4, healRange: 140, tex: 'b_campfire' },
  wall:     { name: '팔리사드', icon: '🧱', hp: 90,  radius: 18, blocks: true, w: 30, h: 30,        tex: 'b_wall' },
  tower:    { name: '감시탑',   icon: '🗼', hp: 170, radius: 20, blocks: true, w: 34, h: 34, dmg: 11, range: 236, cd: 1.15, tex: 'b_tower' },
  spikes:   { name: '가시 함정', icon: '🕳️', hp: 55,  radius: 20, blocks: false, touchDmg: 26,        tex: 'b_spikes' },
  raft:     { name: '뗏목',     icon: '🛶', hp: 120, radius: 24, blocks: false,                       tex: 'b_raft' },
  // --- 상대 섬(약탈 대상) 구성물 ---
  chest:    { name: '보물 상자', icon: '🧰', hp: 200, radius: 22, blocks: false,                       tex: 'b_chest' },
  hut:      { name: '오두막',   icon: '🛖', hp: 150, radius: 22, blocks: true, w: 36, h: 34,           tex: 'b_hut' },
};

/** 불(모닥불) 온기 범위 */
export const FIRE_RANGE = 150;

// ============================================================
// 전투 유닛
// ============================================================
export interface UnitDef {
  name: string;
  faction: 'player' | 'pirate' | 'neutral';
  behavior: 'follow' | 'guard' | 'raider' | 'animal';
  hp: number; dmg: number; range: number; speed: number; cd: number; radius: number;
  ranged?: 'arrow' | 'bomb';
  aoe?: number;
  tex: string;
  critChance?: number; critMul?: number;
  boss?: boolean;
  drops?: Cost;
}

export const UNIT_DEFS: Record<string, UnitDef> = {
  friday: { name: '프라이데이', faction: 'player',  behavior: 'follow', hp: 95,  dmg: 11, range: 38,  speed: 150, cd: 0.8,  radius: 13, tex: 'u_friday' },
  boar:   { name: '멧돼지',    faction: 'neutral', behavior: 'animal', hp: 58,  dmg: 8,  range: 30,  speed: 108, cd: 1.05, radius: 13, tex: 'u_boar', drops: { food: 3 } },
  raider: { name: '해적 검객', faction: 'pirate',  behavior: 'raider', hp: 72,  dmg: 9,  range: 36,  speed: 118, cd: 0.95, radius: 13, tex: 'u_sword', critChance: 0.12, critMul: 2 },
  archer: { name: '해적 궁수', faction: 'pirate',  behavior: 'raider', hp: 48,  dmg: 7,  range: 205, speed: 100, cd: 1.45, radius: 12, tex: 'u_archer', ranged: 'arrow' },
  bomber: { name: '해적 폭탄병', faction: 'pirate', behavior: 'raider', hp: 58, dmg: 26, range: 158, speed: 96, cd: 2.7, radius: 13, tex: 'u_bomber', ranged: 'bomb', aoe: 52 },
  boss:   { name: '해적 두목', faction: 'pirate',  behavior: 'raider', hp: 460, dmg: 22, range: 42,  speed: 104, cd: 1.15, radius: 19, tex: 'u_boss', boss: true },
};

/** 섬에 사는 야생 동물 (사냥감) */
export const ANIMAL_SPAWN: { kind: string; count: number }[] = [
  { kind: 'boar', count: 4 },
];

export interface WaveDef { count: [number, number]; types: string[]; }
export const RAID_WAVES: WaveDef[] = [
  { count: [3, 4], types: ['raider'] },
  { count: [4, 5], types: ['raider', 'archer', 'archer'] },
  { count: [6, 7], types: ['raider', 'raider', 'archer', 'bomber', 'boss'] },
];
export const RAID_REWARD: Cost = { crystal: 2, oil: 4, wood: 12, food: 3 };

// ============================================================
// 채집 노드 (Lv.1 ~ Lv.10)
// ============================================================
export interface NodeKindDef {
  name: string;
  family: Family;
  drops: { item: ItemKey; min: number; max: number }[];
  tex: string;
  radius: number;
  onSand?: boolean;     // 해변에만
  rare?: boolean;
  special?: 'crystal';  // 특수 규칙: 성장하지 않고, 캐내면 1/9/99 중 하나
}

export const NODE_KINDS: Record<string, NodeKindDef> = {
  tree:    { name: '나무',        family: 'wood',    drops: [{ item: 'wood', min: 3, max: 5 }], tex: 'n_tree',  radius: 22 },
  palm:    { name: '야자수',      family: 'wood',    drops: [{ item: 'wood', min: 2, max: 4 }, { item: 'food', min: 1, max: 2 }], tex: 'n_palm', radius: 20, onSand: true },
  berry:   { name: '열매 덤불',   family: 'food',    drops: [{ item: 'food', min: 2, max: 4 }], tex: 'n_berry', radius: 17 },
  shell:   { name: '조개무지',    family: 'food',    drops: [{ item: 'food', min: 1, max: 3 }], tex: 'n_shell', radius: 15, onSand: true },
  rock:    { name: '바위',        family: 'stone',   drops: [{ item: 'stone', min: 3, max: 5 }], tex: 'n_rock', radius: 20 },
  ore:     { name: '광맥',        family: 'stone',   drops: [{ item: 'stone', min: 2, max: 4 }, { item: 'crystal', min: 0, max: 1 }], tex: 'n_ore', radius: 20, rare: true },
  tar:     { name: '타르 웅덩이', family: 'oil',     drops: [{ item: 'oil', min: 2, max: 4 }], tex: 'n_tar',  radius: 20 },
  crystal: { name: '수정 결정',   family: 'crystal', drops: [{ item: 'crystal', min: 1, max: 1 }], tex: 'n_crystal', radius: 18, special: 'crystal' },
};

// ============================================================
// 수정 결정 — 수정의 유일한 공급원
//  · 섬에 미리 배치되지 않는다
//  · 하루에 1개만 섬 어딘가에 나타난다 (성장하지 않음 · 레벨 고정)
//  · 캐내면 1 / 9 / 99개 중 하나가 나온다 (68% / 27% / 5%)
// ============================================================
export interface CrystalDropDef { count: number; weight: number; label: string; }
export const CRYSTAL_DROPS: CrystalDropDef[] = [
  { count: 1,  weight: 68, label: '수정 조각 하나' },
  { count: 9,  weight: 27, label: '수정 무리! 9개!' },
  { count: 99, weight: 5,  label: '수정 폭풍!! 99개!!' },
];

// ============================================================
// 목표(퀘스트)
// ============================================================
export interface Quest { id: string; text: string; hint?: string }
export const QUESTS: Quest[] = [
  { id: 'q_shore',   text: '표류한 해변에서 일어나기' },
  { id: 'q_food',    text: '먹거리 구하기 — 열매 · 조개 · 야자열매', hint: '주운 책으로 요리도 할 수 있다' },
  { id: 'q_fire',    text: '모닥불 피우기 (밤에는 추워진다)', hint: '나무 8 · 돌 4' },
  { id: 'q_book',    text: '기계공학책 1장 공부하기', hint: '📖 책 버튼 → 1장 · 돌과 나무' },
  { id: 'q_tool2',   text: '돌 도구 만들기 (도끼 · 곡괭이)', hint: '공부를 마치면 제작 목록에 나타난다' },
  { id: 'q_hunt',    text: '멧돼지 사냥해 고기 얻기' },
  { id: 'q_fish',    text: '낚시 도구로 물고기 잡기', hint: '물가에서 🎣 낚시' },
  { id: 'q_crystal', text: '수정 3개 확보하기', hint: '광맥 · 하루에 1개 나타나는 수정 결정' },
  { id: 'q_tower',   text: '감시탑 1기 이상 건설' },
  { id: 'q_raid',    text: '해적 원정대 격퇴' },
  { id: 'q_raft',    text: '뗏목 3척 완성하고 섬 탈출', hint: '뗏목 1척: 나무 20 · 돌 12' },
];

// ---------- 기타 ----------
export const SAVE_KEY = 'robinson_island_save_v1';
export const RAFT_GOAL = 3;
export const SKILL_FLASH = 0.35;
