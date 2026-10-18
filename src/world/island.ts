import Phaser from 'phaser';
import { C, FAMILIES, Family, NODE_KINDS, TILE, MAP_TILES, VIEW_H, WORLD_W, WORLD_H } from '../core/config';
import { RNG, ValueNoise } from '../core/rng';

/**
 * 섬 생성 — 매 게임(시드)마다 완전히 다른 섬이 나온다.
 *  - 해안에 표류해서 시작하므로 "해변 스폰 지점"을 반드시 확보한다.
 *  - 자원 분포/풍요도가 시드마다 달라서 섬마다 플레이 감각이 바뀐다.
 */

export const T = {
  WATER_DEEP: 0,
  WATER: 1,
  SAND_WET: 2,
  SAND: 3,
  GRASS: 4,
  JUNGLE: 5,
  ROCK: 6,
} as const;

export interface NodeSpec { id: number; kind: string; x: number; y: number; }

export interface IslandTrait { id: string; name: string; desc: string; }

/** 섬 지형 종류 — 바이옴에 따라 천차만별 */
export interface IslandTerrain { id: string; name: string; desc: string; }

export interface IslandData {
  seed: number;
  w: number;
  h: number;
  tiles: Uint8Array;
  shape: Float32Array;   // 연속 지형값 — 부드러운 해안선 · 수심 렌더링용
  moist: Float32Array;   // 연속 습도값 — 풀/밀림 색 얼룩 렌더링용
  /** 지형 고도 (단위: 타일. 물 위는 음수). 3/4 뷰의 표면 높이 = 이동/차단/사거리 계산에 쓰인다 */
  elev: Float32Array;
  /** 이동 불가(너무 가파름) — 1 이면 못 감. 유닛은 절벽을 돌아간다 */
  steep: Uint8Array;
  /** 계간(계단) — 고원으로 올라가는 유일한 통로. 유닛이 여기서 줄지어 오른다 */
  ramp: Uint8Array;
  nodes: NodeSpec[];
  spawn: { x: number; y: number };
  beach: { x: number; y: number }[];   // 해적 상륙 지점 후보
  center: { x: number; y: number };
  trait: IslandTrait;
  terrain: IslandTerrain;
  hasRiver: boolean;      // 섬을 가르는 물길이 있는가 (여울로만 건넌다)
  /** 사용자가 폭파/평탄화해 넓힌 통로: 타일 인덱스 → 통행 폭 등급(PASS) */
  gates: Record<number, number>;
  counts: Record<string, number>;      // 종류별 노드 개수
}

const idx = (x: number, y: number) => y * MAP_TILES + x;

export const TERRAIN = {
  MAX_ELEV: 2.0,   // 고도 상한(타일) — 난공불락 방지
  STEP_MAX: 0.5,   // 이동 가능 경사 (타일/타일, ≈27°) — 넘으면 못 감
  FLAT_MAX: 0.16,  // 건설 가능 경사 (≈9°) — 건물을 세울 만큼 평평해야 함
  ROAD_MAX: 0.34,  // 큰 장난감이 오를 수 있는 경사 (≈19°) — 이 아래는 '길', 위는 '비탈'
  FORD_ELEV: -0.12, // 여울(얕은 물) 기준 고도 — 이 위면 물길이지만 건널 수 있다
};

/**
 * 통행 규격 — 장난감의 크기. 좁은 입구를 큰 장난감은 못 통과한다.
 * (산·강이 자연 벽이면서 "성"이 되는 이유 = 벽 안이 좁고, 넓은 물자리는 밖에 있다)
 */
export const PASS = {
  WALK: 0,   // 보행 · 소형 병정 — 계간/여울/좁은 입구 통과 가능
  CART: 1,   // 수레 · 중형 — 완만한 길과 넓은 여울만
  RIG: 2,    // 대형 수확기 · 물자 운반 — 넓고 평평한 길만 (경사 ≤ ROAD_MAX)
} as const;
export type PassSize = (typeof PASS)[keyof typeof PASS];

export function generateIsland(seed: number): IslandData {
  const rng = new RNG(seed ^ 0x9e3779b9);
  const elev = new ValueNoise(seed >>> 0, 16);
  const moist = new ValueNoise((seed * 7919) >>> 0, 12);
  const warp = new ValueNoise((seed * 104729) >>> 0, 8);

  const tiles = new Uint8Array(MAP_TILES * MAP_TILES);
  const shapeF = new Float32Array(MAP_TILES * MAP_TILES);
  const moistF = new Float32Array(MAP_TILES * MAP_TILES);
  const cx = MAP_TILES / 2, cy = MAP_TILES / 2;

  // 섬 특성 — 섬마다 자원 풍요도가 다르다
  const traitRoll = rng.next();
  let trait: IslandTrait;
  let bonus: Partial<Record<Family, number>> = {};
  if (traitRoll < 0.22) {
    trait = { id: 'jungle', name: '밀림의 섬', desc: '나무가 유난히 많다' };
    bonus = { wood: 1.7 };
  } else if (traitRoll < 0.44) {
    trait = { id: 'rocky', name: '암석의 섬', desc: '돌이 유난히 많다' };
    bonus = { stone: 1.7 };
  } else if (traitRoll < 0.62) {
    trait = { id: 'tar', name: '타르의 섬', desc: '석유가 유난히 많다' };
    bonus = { oil: 1.8 };
  } else if (traitRoll < 0.76) {
    trait = { id: 'ore', name: '광맥의 섬', desc: '광맥이 유난히 많다 (수정 가루 포함)' };
    bonus = { stone: 1.4 };
  } else if (traitRoll < 0.86) {
    trait = { id: 'rich', name: '풍요로운 섬', desc: '모든 자원이 넉넉하다' };
    bonus = { wood: 1.35, stone: 1.35, oil: 1.35 };
  } else if (traitRoll < 0.95) {
    trait = { id: 'barren', name: '황량한 섬', desc: '자원이 귀하다 대신 상대는 약하다' };
    bonus = { wood: 0.7, stone: 0.7, oil: 0.7 };
  } else {
    trait = { id: 'balanced', name: '균형의 섬', desc: '평범한 섬' };
  }

  // ---- 지형 종류(바이옴별) — 리롤마다 산 있는 섬 / 평평한 섬 / 협곡 / 단구 ----
  const terrainRoll = rng.next();
  let terrain: IslandTerrain;
  let rockThresh = 0.78, rockMoist = 0.42;
  if (terrainRoll < 0.26) {
    terrain = { id: 'mesa', name: '고원 지형', desc: '바위 절벽과 산이 섬을 가른다 — 계간 하나로 오른다' };
    rockThresh = 0.71; rockMoist = 0.38;
  } else if (terrainRoll < 0.52) {
    terrain = { id: 'plain', name: '평원 지형', desc: '거의 평평하다 — 마음껏 지을 수 있는 열린 땅' };
    rockThresh = 0.88; rockMoist = 0.54;
  } else if (terrainRoll < 0.76) {
    terrain = { id: 'canyon', name: '협곡 지형', desc: '섬을 가르는 골짜기 — 병정이 한 줄로만 오른다' };
  } else {
    terrain = { id: 'terrace', name: '단구 지형', desc: '계단처럼 쌓인 언덕 — 위에서 내려다본다' };
  }

  // ---- 섬 실루엣: 큰 덩어리(블롭) 3~5개 합집합 → "읽히는" 섬 모양 (얼룩덜룩 X) ----
  const lobes: { x: number; y: number; r: number }[] = [];
  lobes.push({ x: cx + rng.range(-2.5, 2.5), y: cy + rng.range(-2.5, 2.5), r: rng.range(16, 19) });
  const lobeN = 2 + rng.int(0, 2);
  for (let i = 0; i < lobeN; i++) {
    const a = rng.next() * Math.PI * 2;
    const dd = rng.range(7, 14);
    lobes.push({ x: cx + Math.cos(a) * dd, y: cy + Math.sin(a) * dd, r: rng.range(7, 12) });
  }
  const coastN = new ValueNoise((seed * 2654435761) >>> 0, 26);

  // ---- 1) 지형 ----
  for (let y = 0; y < MAP_TILES; y++) {
    for (let x = 0; x < MAP_TILES; x++) {
      const u = x / MAP_TILES, v = y / MAP_TILES;
      // 블롭 합집합 — 해안선은 매끄러운 원들의 합이라 얼룩덜룩하지 않다
      let m = -1;
      for (const l of lobes) {
        const dd = Math.hypot(x - l.x, y - l.y) / l.r;
        const v2 = 1 - dd;
        if (v2 > m) m = v2;
      }
      // 잔물결은 해안 근처에만(안쪽 깊이는 평평하게)
      const coastW = Math.max(0, 1 - Math.abs(m) * 5);
      const n = (coastN.fbm(u * 3.1, v * 3.1, 3, 0.5, 2) - 0.5) * 0.11 * coastW;
      const shape = 0.40 + 0.58 * m + n;
      const mo = moist.fbm(u * 1.3 + 0.11, v * 1.3 + 0.23, 3, 0.5, 2);

      shapeF[idx(x, y)] = shape;
      moistF[idx(x, y)] = mo;

      let t: number;
      if (shape < 0.30) t = T.WATER_DEEP;
      else if (shape < 0.40) t = T.WATER;
      else if (shape < 0.455) t = T.SAND_WET;
      else if (shape < 0.52) t = T.SAND;
      else if (shape > rockThresh && m > rockMoist) t = T.ROCK;
      else if (m > 0.58) t = T.JUNGLE;
      else t = T.GRASS;
      tiles[idx(x, y)] = t;
    }
  }

  // ---- 2) 해변 정리: 물에 인접한 모래를 젖은 모래로 ----
  const isWater = (t: number) => t === T.WATER || t === T.WATER_DEEP;
  for (let y = 1; y < MAP_TILES - 1; y++) {
    for (let x = 1; x < MAP_TILES - 1; x++) {
      const i = idx(x, y);
      if (tiles[i] === T.SAND) {
        if (isWater(tiles[i - 1]) || isWater(tiles[i + 1]) || isWater(tiles[i - MAP_TILES]) || isWater(tiles[i + MAP_TILES])) {
          tiles[i] = T.SAND_WET;
        }
      }
    }
  }

  // ---- 2.6) 강(리버) — 섬을 가르는 물길. 여울(포드) 2~3곳만 건널 수 있다 ----
// 이게 "전략"의 뼈대다: 물길 = 자연 병목, 여울 = 우리가 통제하는 지점
const riverDepth = new Float32Array(MAP_TILES * MAP_TILES);
let hasRiver = false;
  // 협곡 섬은 '마른 골짜기' — 강까지 있으면 골짜기가 2개라 지도가 안 읽힌다 (18-13)
  if (terrain.id !== 'canyon' && rng.next() < 0.55) {
  hasRiver = true;
  const dir = rng.next() * Math.PI;
  const dx = Math.cos(dir), dy = Math.sin(dir);
  const px = -dy, py = dx;
  const phase = rng.next() * 6.283;
  const N = 48;
  const path: { x: number; y: number; w: number; ford: boolean }[] = [];
  for (let i = 0; i <= N; i++) {
    const t = i / N;
    const along = -32 + t * 64;
    const off = Math.sin(t * Math.PI * 2.1 + phase) * 6.5;
    const tt = t * 64 + 32;
    const wob = 1 + Math.sin(t * Math.PI * 5.3 + phase) * 0.22;
    // 여울: 강을 건너는 2~3곳 (셔플한 위치)
    path.push({ x: cx + dx * along + px * off, y: cy + dy * along + py * off, w: 1.5 * wob, ford: false });
    void tt;
  }
  // 여울 위치 고르기 (서로 떨어진 2~3곳)
  const fords = new Set<number>();
  while (fords.size < 2 + rng.int(0, 1)) {
    const k = 8 + rng.int(0, N - 16);
    let ok = true;
    for (const f of fords) if (Math.abs(f - k) < 12) ok = false;
    if (ok) fords.add(k);
  }
  for (const f of fords) path[f].ford = true;

  for (let y = 0; y < MAP_TILES; y++) {
    for (let x = 0; x < MAP_TILES; x++) {
      let best = 1e9, bestFord = false;
      for (const pt of path) {
        const dd = Math.hypot(x - pt.x, y - pt.y) - pt.w;
        if (dd < best) { best = dd; bestFord = pt.ford; }
      }
      if (best > 2.4) continue;                 // 강에서 멀면 무시
      const i = idx(x, y);
      const t = tiles[i];
      if (t === T.WATER || t === T.WATER_DEEP) continue;
      if (best <= 0.35 && !bestFord) {
        tiles[i] = T.WATER;                     // 강물 = 못 감
        riverDepth[i] = 1;
      } else if (bestFord && best <= 1.5) {
        riverDepth[i] = 0.45;                   // 여울 — 얕게 잠길 수 있다 (건널 수 있음)
      } else {
        riverDepth[i] = 0.55;                   // 강둑
      }
    }
  }
}
// ============================================================
  // 2.7) 지형 고도 · 계간 · 경사 — "3/4 뷰에서 실제로 오르내리는 지형"
  //  · 단위: 타일(1 = 32px). 물 아래는 음수.
  //  · MAX_ELEV 상한 → 고도가 아무리 높아도 막히지 않으므로 "난공불락"이 되지 않는다
  //  · 바위 고원은 절벽(수직)이 되지만, 고원마다 계간(폭 1타일)을 반드시 파서 길로 연결
  //    → 유닛은 계간에서 줄지어 오르고, 아래를 공격받기 쉽다 = 방어에 유리한 지형
  // ============================================================
  const MAX_ELEV = TERRAIN.MAX_ELEV;
  const STEP_MAX = TERRAIN.STEP_MAX;
  const FLAT_MAX = TERRAIN.FLAT_MAX;
  const elevH = new Float32Array(MAP_TILES * MAP_TILES);
  const ramp = new Uint8Array(MAP_TILES * MAP_TILES);
  const steep = new Uint8Array(MAP_TILES * MAP_TILES);
  const bump = new ValueNoise((seed * 15485863) >>> 0, 14);
  const sstep = (a: number, b: number, x: number) => {
    const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
    return t * t * (3 - 2 * t);
  };
  const rockAt = (x: number, y: number) =>
    x >= 0 && y >= 0 && x < MAP_TILES && y < MAP_TILES && tiles[idx(x, y)] === T.ROCK;

  for (let y = 0; y < MAP_TILES; y++) {
    for (let x = 0; x < MAP_TILES; x++) {
      const i = idx(x, y);
      const s = shapeF[i], m = moistF[i];
      const u = x / MAP_TILES, v = y / MAP_TILES;
      const rd = riverDepth[i];
      let h: number;
      if (tiles[i] === T.WATER && s >= 0.40) {
        h = -0.34;                                                          // 강물 (물길)
      } else if (rd > 0 && s >= 0.40) {
        const land = 0.28 + Math.pow(Math.max(0, Math.min(1, (s - 0.495) / 0.505)), 1.5) * 0.50;
        h = rd > 0.9 ? -0.34 : land + 0.18;                                 // 여울은 얕게(−0.05) / 강둑은 높게
        if (rd > 0.4 && rd < 0.9) h = -0.05 + (land + 0.18) * 0.25;
      } else if (s < 0.40) {
        h = -((0.40 - s) / 0.40) * 1.8;                                  // 해저
      } else if (s < 0.495) {
        h = sstep(0.40, 0.495, s) * 0.28;                                 // 해변
      } else {
        const t = Math.max(0, Math.min(1, (s - 0.495) / 0.505));
        h = 0.28 + Math.pow(t, 1.5) * 0.50;                               // 초원(완만)
        h += (bump.fbm(u * 1.6, v * 1.6, 3, 0.5, 2) - 0.5) * 0.22 * sstep(0.50, 0.63, s);
        if (s > rockThresh && m > rockMoist) {
          const rt = Math.max(0, Math.min(1, (s - rockThresh) / (1 - rockThresh)));
          h = Math.max(h, 0.95 + 0.45 * rt);                             // 고원(절벽)
        }
      }
      elevH[i] = h;
    }
  }

  // ---- 메사(산) — 최대 2개 (18-13)
  //  · 정상은 **평평하다** → 그 위에 성/방어기물을 짓는다
  //  · 접지부에 **암벽 링 1줄** → 자연 성벽(전 규격 통과 불가). 입구는 계간뿐
  //  · 뾰족한 봉우리는 없다 — 원반형이라 360° 어느 쪽에서나 같은 성
  const mesaTop = new Uint8Array(MAP_TILES * MAP_TILES);   // 정상면(완전 평지)
  const protect = new Uint8Array(MAP_TILES * MAP_TILES);   // 평탄화/경사판정 제외 구역
  const mesas: { cx: number; cy: number; R: number; top: number }[] = [];
  {
    const cand: { x: number; y: number; v: number }[] = [];
    for (let y = 2; y < MAP_TILES - 2; y++) {
      for (let x = 2; x < MAP_TILES - 2; x++) {
        if (!rockAt(x, y)) continue;
        const v = shapeF[idx(x, y)];
        if (v < 0.82) continue;
        let isMax = true;
        for (let dy = -4; dy <= 4 && isMax; dy++) {
          for (let dx = -4; dx <= 4; dx++) {
            const nx = x + dx, ny = y + dy;
            if (nx < 1 || ny < 1 || nx >= MAP_TILES - 1 || ny >= MAP_TILES - 1) continue;
            if (shapeF[idx(nx, ny)] > v) { isMax = false; break; }
          }
        }
        if (isMax) cand.push({ x, y, v });
      }
    }
    cand.sort((a, b) => b.v - a.v);
    const chosen: typeof cand = [];
    for (const p of cand) {
      if (chosen.length >= 2) break;                                   // 산은 최대 2개 — 그 이상은 방해
      if (chosen.every((q) => Math.hypot(q.x - p.x, q.y - p.y) > 18)) chosen.push(p);
    }
    for (const p of chosen) {
      const R = Math.round(6 + rng.next() * 3);                          // 정상 반경 6~8타일
      let local = 0;
      for (let dy = -R; dy <= R; dy++) {
        for (let dx = -R; dx <= R; dx++) {
          const x = p.x + dx, y = p.y + dy;
          if (x < 0 || y < 0 || x >= MAP_TILES || y >= MAP_TILES) continue;
          local = Math.max(local, elevH[idx(x, y)]);
        }
      }
      const top = Math.min(MAX_ELEV - 0.15, Math.max(local + 0.75, 0.95));  // 확실히 높아야 암벽이 성벽이 된다
      const edgeTop = Math.max(local + 0.75, 0.95) - (STEP_MAX + 0.18);      // 링 바깥 = 반드시 못 오르는 높이
      for (let dy = -(R + 3); dy <= R + 3; dy++) {
        for (let dx = -(R + 3); dx <= R + 3; dx++) {
          const x = p.x + dx, y = p.y + dy;
          if (x < 0 || y < 0 || x >= MAP_TILES || y >= MAP_TILES) continue;
          const i = idx(x, y);
          if (isWater(tiles[i])) continue;
          const d = Math.hypot(dx, dy);
          if (d <= R) {
            // 정상: 아주 완만하게만 흔들린다 (FLAT_MAX 안) → 마음껏 지을 수 있다
            elevH[i] = Math.max(elevH[i], top + (bump.fbm(x / MAP_TILES * 3, y / MAP_TILES * 3, 2, 0.5, 2) - 0.5) * 0.10);
            mesaTop[i] = 1; protect[i] = 1;
          } else if (d <= R + 2) {
            // 접지부 암벽 링 — 여기가 자연 성벽
            const w = (d - R) / 2;
            elevH[i] = Math.min(elevH[i], edgeTop + w * 0.18);
            protect[i] = 1;
          }
        }
      }
      mesas.push({ cx: p.x, cy: p.y, R, top });
    }
  }
  for (let i = 0; i < elevH.length; i++) if (elevH[i] > MAX_ELEV) elevH[i] = MAX_ELEV;

  // ---- 계간(계단) — 고원마다 길 1~2개 ----
  {
    // 해변에서부터의 거리 → "접근성" 측정용
    const distLow = new Float32Array(MAP_TILES * MAP_TILES).fill(9999);
    const q: number[] = [];
    for (let i = 0; i < tiles.length; i++) {
      const t = tiles[i];
      if (t === T.SAND || t === T.SAND_WET) { distLow[i] = 0; q.push(i); }
    }
    for (let head = 0; head < q.length; head++) {
      const c = q[head], cxx = c % MAP_TILES, cyy = (c / MAP_TILES) | 0;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as [number, number][]) {
        const nx = cxx + dx, ny = cyy + dy;
        if (nx < 0 || ny < 0 || nx >= MAP_TILES || ny >= MAP_TILES) continue;
        const ni = idx(nx, ny);
        if (distLow[ni] > distLow[c] + 1) { distLow[ni] = distLow[c] + 1; q.push(ni); }
      }
    }
    // 바위 고원 영역 분리
    const seen = new Uint8Array(MAP_TILES * MAP_TILES);
    const regions: number[][] = [];
    for (let i = 0; i < tiles.length; i++) {
      if (tiles[i] !== T.ROCK || seen[i]) continue;
      const stack = [i];
      seen[i] = 1;
      const region: number[] = [];
      while (stack.length) {
        const c = stack.pop()!;
        region.push(c);
        const cxx = c % MAP_TILES, cyy = (c / MAP_TILES) | 0;
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as [number, number][]) {
          const nx = cxx + dx, ny = cyy + dy;
          if (nx < 0 || ny < 0 || nx >= MAP_TILES || ny >= MAP_TILES) continue;
          const ni = idx(nx, ny);
          if (seen[ni] || tiles[ni] !== T.ROCK) continue;
          seen[ni] = 1;
          stack.push(ni);
        }
      }
      if (region.length >= 10) regions.push(region);
    }
    // 영역마다 접근성이 가장 좋은 입구에서 중심까지 계단을 판다
    for (const region of regions) {
      const set = new Set(region);
      let entry = -1, bestCost = Infinity;
      let cxr = 0, cyr = 0;
      for (const c of region) { cxr += c % MAP_TILES; cyr += (c / MAP_TILES) | 0; }
      cxr /= region.length; cyr /= region.length;
      for (const c of region) {
        const cxx = c % MAP_TILES, cyy = (c / MAP_TILES) | 0;
        let cost = Infinity;
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as [number, number][]) {
          const nx = cxx + dx, ny = cyy + dy;
          if (!rockAt(nx, ny) && nx >= 0 && ny >= 0 && nx < MAP_TILES && ny < MAP_TILES) {
            const t = tiles[idx(nx, ny)];
            if (t !== T.WATER && t !== T.WATER_DEEP) cost = Math.min(cost, distLow[idx(nx, ny)]);
          }
        }
        if (cost < bestCost) { bestCost = cost; entry = c; }
      }
      if (entry < 0) continue;
      // 입구 → 중심 BFS (영역 안에서만)
      const prev = new Int32Array(MAP_TILES * MAP_TILES).fill(-1);
      const seen2 = new Uint8Array(MAP_TILES * MAP_TILES);
      seen2[entry] = 1;
      const stack = [entry];
      let goal = entry;
      let bestD = Infinity;
      while (stack.length) {
        const c = stack.pop()!;
        const cxx = c % MAP_TILES, cyy = (c / MAP_TILES) | 0;
        const d = Math.hypot(cxx - cxr, cyy - cyr);
        if (d < bestD) { bestD = d; goal = c; }
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as [number, number][]) {
          const nx = cxx + dx, ny = cyy + dy;
          if (nx < 0 || ny < 0 || nx >= MAP_TILES || ny >= MAP_TILES) continue;
          const ni = idx(nx, ny);
          if (seen2[ni] || !set.has(ni)) continue;
          seen2[ni] = 1;
          prev[ni] = c;
          stack.push(ni);
        }
      }
      // 경로를 따라 고도를 완만하게 낮춘다 (계단)
      const path: number[] = [];
      for (let c = goal; c >= 0; c = prev[c]) path.push(c);
      path.reverse();
      if (path.length >= 2) {
        const hLow = elevH[entry], hHigh = elevH[goal];
        for (let k = 0; k < path.length; k++) {
          const c = path[k];
          const t = k / (path.length - 1);
          const target = hLow + (hHigh - hLow) * Math.pow(t, 1.25);
          elevH[c] = target;
          ramp[c] = 1;
          // 옆 타일도 살짝 낮춰 계단이 보이게 (폭 3칸)
          const cxx = c % MAP_TILES, cyy = (c / MAP_TILES) | 0;
          for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as [number, number][]) {
            const nx = cxx + dx, ny = cyy + dy;
            if (!rockAt(nx, ny)) continue;
            const ni = idx(nx, ny);
            if (ramp[ni]) continue;
            elevH[ni] = Math.min(elevH[ni], target + 0.22);
          }
        }
      }
    }
  }

  // ---- 지형 종류별 성형 (바이옴 성격) ----
  if (terrain.id === 'canyon') {
    // 섬 한가운데를 가르는 골짜기 — 병정이 한 줄로만 오가는 병목
    const ang = rng.next() * Math.PI;
    const anx = Math.cos(ang), any_ = Math.sin(ang);
    const off = (rng.next() - 0.5) * 7;
    for (let y = 0; y < MAP_TILES; y++) {
      for (let x = 0; x < MAP_TILES; x++) {
        const i = idx(x, y);
        const t = tiles[i];
        if (t === T.WATER || t === T.WATER_DEEP) continue;
        const dx = x - cx, dy = y - cy;
        const d = Math.abs(dx * any_ - dy * anx + off);          // 중심선까지 거리(타일)
        if (d > 3.6) continue;
        const w = 1 - sstep(1.0, 3.6, d);                        // 골짜기 바닥 폭 ≈ 2타일
        const bottom = 0.12 + d * 0.12;                          // 바닥은 평평하게 (큰 장난감도 통과)
        elevH[i] = elevH[i] * (1 - w) + Math.min(elevH[i], bottom) * w;
      }
    }
  } else if (terrain.id === 'terrace') {
    const stepH = 0.30;   // 한 단 높이 — 큰 장난감까지 오를 수 있는 완만한 계단 (18-13)
    for (let i = 0; i < elevH.length; i++) {
      if (elevH[i] <= 0.45) continue;                 // 평지는 그대로 (전체 타일링 방지)
      const q = Math.round(elevH[i] / stepH) * stepH;
      elevH[i] = elevH[i] + (q - elevH[i]) * 0.7;     // 70%만 단화 → 계단처럼 보이지만 급하지 않게
    }
  }

  // ---- 급경사 금지 (18-13): 접지부 암벽을 제외한 모든 단차를 ROAD_MAX 이하로 평탄화 ----
//  · "위에서부터 보이는 섬" — 어느 방향에서 봐도 완만하고, 성벽은 의도된 한 줄뿐
  {
    const NB: [number, number][] = [[1, 0], [-1, 0], [0, 1], [0, -1]];
    const cap = TERRAIN.ROAD_MAX - 0.01;
    for (let pass = 0; pass < 32; pass++) {
      let moved = 0;
      for (let y = 1; y < MAP_TILES - 1; y++) {
        for (let x = 1; x < MAP_TILES - 1; x++) {
          const i = idx(x, y);
          if (protect[i] || isWater(tiles[i])) continue;
          for (const [dx, dy] of NB) {
            const ni = idx(x + dx, y + dy);
            if (protect[ni] || isWater(tiles[ni])) continue;
            const d = elevH[i] - elevH[ni];
            if (d > cap) { const f = (d - cap) * 0.5; elevH[i] -= f; elevH[ni] += f; moved++; }
            else if (d < -cap) { const f = (-d - cap) * 0.5; elevH[i] += f; elevH[ni] -= f; moved++; }
          }
        }
      }
      if (!moved) break;
    }
  }

  // ---- 경사 판정: 너무 가파르면 못 감 ----
  for (let y = 0; y < MAP_TILES; y++) {
    for (let x = 0; x < MAP_TILES; x++) {
      const i = idx(x, y);
      if (tiles[i] === T.WATER || tiles[i] === T.WATER_DEEP) { steep[i] = 1; continue; }
      if (mesaTop[i]) { steep[i] = 0; continue; }        // 정상면 = 평평하므로 항상 걸어갈 수 있다
      let bad = 0;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as [number, number][]) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= MAP_TILES || ny >= MAP_TILES) continue;
        const ni = idx(nx, ny);
        if (tiles[ni] === T.WATER || tiles[ni] === T.WATER_DEEP) continue;   // 물가 절벽은 못 감
        if (Math.abs(elevH[ni] - elevH[i]) > STEP_MAX) { bad = 1; break; }
      }
      steep[i] = bad;
    }
  }
  // ---- 3) 스폰(해변) 지점 찾기: 물에 인접한 모래 ----
  const beach: { x: number; y: number }[] = [];
  for (let y = 0; y < MAP_TILES; y++) {
    for (let x = 0; x < MAP_TILES; x++) {
      const t = tiles[idx(x, y)];
      if (t !== T.SAND && t !== T.SAND_WET) continue;
      const nearWater =
        (x > 0 && isWater(tiles[idx(x - 1, y)])) || (x < MAP_TILES - 1 && isWater(tiles[idx(x + 1, y)])) ||
        (y > 0 && isWater(tiles[idx(x, y - 1)])) || (y < MAP_TILES - 1 && isWater(tiles[idx(x, y + 1)]));
      if (nearWater) beach.push({ x: x * TILE + TILE / 2, y: y * TILE + TILE / 2 });
    }
  }

  // 스폰: 해변 중 대략 무작위 한 곳 (해적 상륙 지점은 반대편 위주로 사용)
  const spawnIdx = Math.floor(rng.next() * Math.max(1, beach.length));
  const spawn = beach[spawnIdx] ?? { x: WORLD_W / 2, y: WORLD_H / 2 };

  // ---- 4) 노드 배치 ----
  const nodes: NodeSpec[] = [];
  const counts: Record<string, number> = {};
  const addNode = (kind: string, tx: number, ty: number) => {
    const s = NODE_KINDS[kind];
    if (!s) return;
    // 점유 검사 (너무 붙어 있지 않게)
    const px = tx * TILE + TILE / 2, py = ty * TILE + TILE / 2;
    for (const n of nodes) {
      if (Math.abs(n.x - px) < 44 && Math.abs(n.y - py) < 44) return;
    }
    nodes.push({ id: nodes.length, kind, x: px, y: py });
    counts[kind] = (counts[kind] ?? 0) + 1;
  };

  const densityNoise = new ValueNoise((seed * 31337) >>> 0, 20);
  const b = (f: Family) => bonus[f] ?? 1;

  for (let y = 2; y < MAP_TILES - 2; y++) {
    for (let x = 2; x < MAP_TILES - 2; x++) {
      const t = tiles[idx(x, y)];
      if (isWater(t)) continue;
      const dn = densityNoise.fbm(x / MAP_TILES, y / MAP_TILES, 3, 0.55, 2);
      const r = rng.next();

      if (t === T.SAND || t === T.SAND_WET) {
        // 야자수: 해변 (드물게)
        if (r < 0.020 * b('wood') * (0.7 + dn)) addNode('palm', x, y);
        continue;
      }
      if (t === T.JUNGLE) {
        if (r < 0.085 * b('wood') * (0.6 + dn)) addNode('tree', x, y);
        else if (r < 0.105 * b('oil')) addNode('tar', x, y);
        continue;
      }
      if (t === T.GRASS) {
        if (r < 0.030 * b('wood') * (0.6 + dn)) addNode('tree', x, y);
        else if (r < 0.046 * b('stone') * (0.6 + dn)) addNode('rock', x, y);
        else if (r < 0.058 * b('oil')) addNode('tar', x, y);
        else if (r < 0.064 * b('stone')) addNode('ore', x, y);
        continue;
      }
      if (t === T.ROCK) {
        if (r < 0.060 * b('stone') * (0.6 + dn)) addNode('rock', x, y);
        else if (r < 0.085 * b('stone')) addNode('ore', x, y);
        else if (r < 0.095 * b('oil')) addNode('tar', x, y);
        continue;
      }
    }
  }

  return {
    seed,
    w: MAP_TILES,
    h: MAP_TILES,
    tiles,
    shape: shapeF,
    moist: moistF,
    elev: elevH,
    steep,
    ramp,
    nodes,
    spawn,
    beach,
    center: { x: (cx) * TILE, y: (cy) * TILE },
    trait,
    terrain,
    hasRiver,
    gates: {},
    counts,
  };
}

// ============================================================
// 지형 질의 — 이동/건설/사거리 계산이 모두 이 함수를 거친다
// ============================================================

/** 타일 좌표의 고도(경계 밖은 0) */
export function elevTile(d: IslandData, tx: number, ty: number): number {
  if (tx < 0 || ty < 0 || tx >= d.w || ty >= d.h) return 0;
  return d.elev[ty * d.w + tx];
}

/** 월드 좌표의 고도(bilinear) — 스프라이트가 지면에 서는 높이 */
export function elevAt(d: IslandData, wx: number, wy: number): number {
  const fx = wx / TILE - 0.5, fy = wy / TILE - 0.5;
  const x0 = Math.max(0, Math.min(d.w - 1, Math.floor(fx)));
  const y0 = Math.max(0, Math.min(d.h - 1, Math.floor(fy)));
  const x1 = Math.max(0, Math.min(d.w - 1, x0 + 1));
  const y1 = Math.max(0, Math.min(d.h - 1, y0 + 1));
  const tx = Math.max(0, Math.min(1, fx - Math.floor(fx)));
  const ty = Math.max(0, Math.min(1, fy - Math.floor(fy)));
  const a = d.elev[y0 * d.w + x0], b = d.elev[y0 * d.w + x1];
  const c = d.elev[y1 * d.w + x0], e = d.elev[y1 * d.w + x1];
  return (a * (1 - tx) + b * tx) * (1 - ty) + (c * (1 - tx) + e * tx) * ty;
}

/** 그 타일의 경사(타일/타일) — 주변 8방향 중 가장 급한 곳 */
export function slopeAt(d: IslandData, tx: number, ty: number): number {
  const h = elevTile(d, tx, ty);
  let max = 0;
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      if (!dx && !dy) continue;
      const dist = Math.hypot(dx, dy);
      max = Math.max(max, Math.abs(elevTile(d, tx + dx, ty + dy) - h) / dist);
    }
  }
  return max;
}

/**
 * 그 자리에 sx×sy 풋프린트를 세울 수 있는가 — 평평한 땅이어야 한다.
 * (물 위·경사지·가파른 경계 → 불가. 방어 기물은 큰 평지가 필요해 산에는 안 올라간다)
 */
export function isFlatSpot(d: IslandData, tx: number, ty: number, sx: number, sy: number): boolean {
  const h0 = elevTile(d, tx, ty);
  const x0 = tx - ((sx - 1) >> 1), y0 = ty - ((sy - 1) >> 1);
  for (let y = y0; y < y0 + sy; y++) {
    for (let x = x0; x < x0 + sx; x++) {
      if (x < 0 || y < 0 || x >= d.w || y >= d.h) return false;
      const t = d.tiles[y * d.w + x];
      if (t === T.WATER || t === T.WATER_DEEP) return false;
      if (Math.abs(d.elev[y * d.w + x] - h0) > TERRAIN.FLAT_MAX) return false;
    }
  }
  return true;
}

/**
 * 그 길이 통과할 수 있는 최대 장난감 규격. −1 = 통과 불가(= 자연 벽)
 *  · 절벽(steep) · 깊은 물 → 완전한 벽
 *  · 여울(얕은 물길) · 계간(계단) → 보행만
 *  · 완만한 길(≤ROAD_MAX) → 수레까지 / 평지 → 대형까지
 *  · 사용자가 폭파·평탄화한 통로(gates)는 자연 등급보다 넓어진다
 */
export function passWidthAt(d: IslandData, tx: number, ty: number): number {
  if (tx < 0 || ty < 0 || tx >= d.w || ty >= d.h) return -1;
  const i = ty * d.w + tx;
  const h = d.elev[i];
  let w: number;
  if (d.steep[i]) w = -1;                                  // 절벽 = 자연 벽
  else if (h < TERRAIN.FORD_ELEV) w = -1;                 // 깊은 강·바다 = 자연 벽
  else if (h < 0) w = PASS.WALK;                          // 여울 — 얕은 물길(보행만)
  else if (d.ramp[i]) w = PASS.WALK;                      // 계간 = 계단 → 보행만
  else {
    const s = slopeAt(d, tx, ty);
    w = s <= TERRAIN.FLAT_MAX ? PASS.RIG : s <= TERRAIN.ROAD_MAX ? PASS.CART : PASS.WALK;
  }
  const opened = d.gates[i];                              // 사용자가 넓힌 입구
  if (opened !== undefined && opened > w) w = Math.min(PASS.RIG, opened);
  return w;
}

/** 입구를 넓힌다(폭파 · 계단 깎기 · 평탄화). level = 만들 규격. 넓힐수록 벽이 약해진다 */
export function widenGate(d: IslandData, tx: number, ty: number, level: PassSize): boolean {
  const cur = passWidthAt(d, tx, ty);
  if (cur === -1 || cur >= level) return false;            // 벽을 뚫을 수 없거나 이미 넓음
  d.gates[ty * d.w + tx] = level;
  if (level >= PASS.CART) d.steep[ty * d.w + tx] = 0;      // 절벽을 깎으면 통로가 열린다
  if (level >= PASS.RIG) d.ramp[ty * d.w + tx] = 0;        // 계간을 평탄화하면 차가 오른다
  return true;
}

/** 월드 좌표에서 해당 규격이 지나갈 수 있는가 (길찾기·대형 장난감 AI용) */
export function passAt(d: IslandData, wx: number, wy: number, size: PassSize): boolean {
  return passWidthAt(d, Math.floor(wx / TILE), Math.floor(wy / TILE)) >= size;
}

/** 고지대 사거리 보정 — 1타일당 +10%, 최대 +25% (방어가 유리해지되 무한정은 아님) */
export function highGroundBonus(d: IslandData, fromX: number, fromY: number, toX: number, toY: number): number {
  const dh = elevAt(d, fromX, fromY) - elevAt(d, toX, toY);
  if (dh <= 0.2) return 1;
  return 1 + Math.min(0.25, (dh - 0.2) * 0.1);
}

// ============================================================
// 렌더링: 섬 전체를 "그림"으로 굽는다 (성능)
//  · 32px 타일을 찍는 대신, 연속 지형값을 4px 블록으로 평가해 그린다
//    → 해안선이 계단이 아니라 곡선이 되고, 물은 수심 그라데이션 + 해안 거품
//  · 땅은 미세 색 얼룩 + 경계 음영(절벽/풀 그림자), 그 위에 입자 질감
// ============================================================
const SUB = 8;                 // 타일 하나 = 8×8 블록
const R = MAP_TILES * SUB;     // 블록 해상도 (68 × 8 = 544)

type RGB = [number, number, number];
const rgba = (n: number): RGB => [(n >> 16) & 255, (n >> 8) & 255, n & 255];
const mixc = (a: RGB, b: RGB, t: number): RGB => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const scalec = (a: RGB, f: number): RGB => [a[0] * f, a[1] * f, a[2] * f];
const hash2 = (x: number, y: number, s: number) => {
  let h = (Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(s | 0, 1274126177)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
};

const P_WATER_DEEP = rgba(0x0d3350);
const P_WATER_MID = rgba(0x175a86);
const P_WATER_SHALLOW = rgba(0x2e8fc0);
const P_WATER_LAGOON = rgba(0x5cc2df);
const P_FOAM = rgba(0xf0fbff);
const P_SAND_WET = rgba(0xbea26a);
const P_SAND = rgba(0xe2cd98);
const P_SAND_HI = rgba(0xf1e2b6);
const P_GRASS = rgba(0x4f8f4d);
const P_GRASS_HI = rgba(0x6aa85a);
const P_GRASS_LO = rgba(0x3c7440);
const P_JUNGLE = rgba(0x2e6b3e);
const P_JUNGLE_HI = rgba(0x418a52);
const P_ROCK = rgba(0x8d9198);
const P_ROCK_HI = rgba(0xa9aeb5);

const BLK_WATER = 0, BLK_WET = 1, BLK_SAND = 2, BLK_GRASS = 3, BLK_JUNGLE = 4, BLK_ROCK = 5;

/** 타일 격자값을 선형 보간 — 블록 좌표(타일 단위)로 샘플 */
function bilinear(arr: Float32Array, tx: number, ty: number): number {
  const SZ = MAP_TILES;
  const fx = tx < 0 ? 0 : tx > SZ - 1.001 ? SZ - 1.001 : tx;
  const fy = ty < 0 ? 0 : ty > SZ - 1.001 ? SZ - 1.001 : ty;
  const x0 = fx | 0, y0 = fy | 0;
  const u = fx - x0, v = fy - y0;
  const i = y0 * SZ + x0;
  const a = arr[i], b = arr[i + 1], cc = arr[i + SZ], dd = arr[i + SZ + 1];
  return a * (1 - u) * (1 - v) + b * u * (1 - v) + cc * (1 - u) * v + dd * u * v;
}

/** 섬을 그림으로 그려 'island_paint' 캔버스 텍스처에 담는다 (오프라인 검증용으로도 공개) */
export function paintIsland(scene: Phaser.Scene, data: IslandData) {
  const seed = data.seed | 0;
  const N = R * R;
  const out = new Uint8ClampedArray(N * 4);
  const cls = new Uint8Array(N);
  const dist = new Float32Array(N);
  const INF = 1e9;

  // ---- 1패스: 블록 분류 + 기본색 (게임 규칙과 같은 임계값) ----
  for (let j = 0; j < R; j++) {
    const ty = (j + 0.5) / SUB;
    for (let i = 0; i < R; i++) {
      const tx = (i + 0.5) / SUB;
      const s = bilinear(data.shape, tx, ty);
      const m = bilinear(data.moist, tx, ty);
      const k = j * R + i;
      const o = k * 4;
      const h0 = hash2(i, j, seed);
      const h1 = hash2(i >> 2, j >> 2, seed ^ 0x51f3);
      let c: RGB;
      if (s < 0.40) { cls[k] = BLK_WATER; c = P_WATER_MID; }
      else if (s < 0.45) { cls[k] = BLK_WET; c = mixc(P_SAND, P_SAND_WET, (0.45 - s) / 0.05); }
      else if (s < 0.495) { cls[k] = BLK_SAND; c = mixc(P_SAND, P_SAND_HI, Math.max(0, (s - 0.48) / 0.04) * 0.5); }
      else if (s > 0.78 && m > 0.42) { cls[k] = BLK_ROCK; c = mixc(P_ROCK, P_ROCK_HI, Math.max(0, Math.min(1, (s - 0.78) / 0.16)) * 0.55); }
      else if (m > 0.58) { cls[k] = BLK_JUNGLE; c = mixc(P_JUNGLE, P_JUNGLE_HI, Math.max(0, Math.min(1, (m - 0.58) / 0.2)) * 0.6); }
      else {
        cls[k] = BLK_GRASS;
        c = mixc(P_GRASS_LO, P_GRASS, Math.max(0, Math.min(1, (m - 0.30) / 0.22)));
        c = mixc(c, P_GRASS_HI, Math.max(0, Math.min(1, (m - 0.50) / 0.16)) * 0.55);
      }
      if (cls[k] >= BLK_WET) {
        c = scalec(c, 0.965 + 0.07 * h0);
        if (h0 > 0.94) c = scalec(c, 0.92);
      }
      out[o] = c[0]; out[o + 1] = c[1]; out[o + 2] = c[2]; out[o + 3] = 255;
    }
  }

  // ---- 2패스: 해안까지의 거리 (물 깊이·거품) — 2회 스캔 근사 ----
  for (let k = 0; k < N; k++) dist[k] = cls[k] >= BLK_WET ? 0 : INF;
  for (let j = 0; j < R; j++) {
    for (let i = 0; i < R; i++) {
      const k = j * R + i;
      let d = dist[k];
      if (i > 0) d = Math.min(d, dist[k - 1] + 1);
      if (j > 0) {
        d = Math.min(d, dist[k - R] + 1);
        if (i > 0) d = Math.min(d, dist[k - R - 1] + 1.414);
        if (i < R - 1) d = Math.min(d, dist[k - R + 1] + 1.414);
      }
      dist[k] = d;
    }
  }
  for (let j = R - 1; j >= 0; j--) {
    for (let i = R - 1; i >= 0; i--) {
      const k = j * R + i;
      let d = dist[k];
      if (i < R - 1) d = Math.min(d, dist[k + 1] + 1);
      if (j < R - 1) {
        d = Math.min(d, dist[k + R] + 1);
        if (i < R - 1) d = Math.min(d, dist[k + R + 1] + 1.414);
        if (i > 0) d = Math.min(d, dist[k + R - 1] + 1.414);
      }
      dist[k] = d;
    }
  }

  // ---- 3패스: 수심/거품 + 땅 경계 음영 ----
  for (let j = 0; j < R; j++) {
    for (let i = 0; i < R; i++) {
      const k = j * R + i;
      const o = k * 4;
      const h0 = hash2(i, j, seed ^ 0x7a11);
      if (cls[k] === BLK_WATER) {
        const dw = dist[k];
        const s = bilinear(data.shape, (i + 0.5) / SUB, (j + 0.5) / SUB);
        const depthElev = Math.max(0, Math.min(1, (0.40 - s) / 0.17));
        const far = Math.min(1, dw / 44);
        let c = mixc(P_WATER_MID, P_WATER_DEEP, Math.max(depthElev * 0.45, far));
        const shore = Math.max(0, 1 - dw / 2.2);
        if (shore > 0) {
          c = mixc(c, P_WATER_SHALLOW, shore * 0.8);
          c = mixc(c, P_WATER_LAGOON, shore * shore * 0.4);
        }
        if (dw < 1.6) c = scalec(c, 0.88 + 0.12 * (dw / 1.6));    // 육지 밑 접촉 음영
        const foam = Math.max(0, 1.35 - dw) * (0.3 + 0.7 * h0);
        if (foam > 0.2) c = mixc(c, P_FOAM, Math.min(0.92, foam));
        c = scalec(c, 0.97 + 0.05 * h0);
        out[o] = c[0]; out[o + 1] = c[1]; out[o + 2] = c[2];
      } else {
        const cl = cls[k];
        const up = j > 0 ? cls[k - R] : cl;
        const dn = j < R - 1 ? cls[k + R] : cl;
        const lf = i > 0 ? cls[k - 1] : cl;
        const rt2 = i < R - 1 ? cls[k + 1] : cl;
        let f = 1;
        if (cl === BLK_GRASS || cl === BLK_JUNGLE) {
          if (up === BLK_WATER || dn === BLK_WATER || lf === BLK_WATER || rt2 === BLK_WATER) f = 0.84;   // 물에 닿은 풀 — 절벽 음영
          else if (up === BLK_SAND || up === BLK_WET || lf === BLK_SAND || lf === BLK_WET) f = 0.93;
        } else if (cl === BLK_ROCK) {
          const rn = (t: number) => t === BLK_ROCK;
          if (!rn(dn)) f *= 0.7;
          else if (!rn(up)) f *= 1.18;
          if (!rn(lf)) f *= 0.92;
          if (!rn(rt2)) f *= 1.06;
        }
        if (f !== 1) {
          out[o] = out[o] * f;
          out[o + 1] = out[o + 1] * f;
          out[o + 2] = out[o + 2] * f;
        }
      }
    }
  }

  // ---- 4패스: 가짜 3D — 섬 전체가 물 위로 솟은 절벽 단면 ----
  const land = new Uint8Array(N);
  for (let k = 0; k < N; k++) land[k] = cls[k] >= BLK_WET ? 1 : 0;

  const CLIFF_DX = 1, CLIFF_DY = 5;                     // 절벽 두께(블록) — 아래·오른쪽으로
  const P_CLIFF_HI = rgba(0xc9a970);
  const P_CLIFF_MID = rgba(0x8a6a48);
  const P_CLIFF_LO = rgba(0x3f3021);

  for (let j = 0; j < R; j++) {
    for (let i = 0; i < R; i++) {
      const k = j * R + i;
      if (land[k]) continue;
      let hit = 0;
      const ii = i - CLIFF_DX;
      if (ii < 0) continue;
      for (let kk = 1; kk <= CLIFF_DY; kk++) {
        const jj = j - kk;
        if (jj < 0) break;
        if (land[jj * R + ii]) { hit = kk; break; }
      }
      if (!hit) continue;
      const t = (hit - 1) / (CLIFF_DY - 1);             // 0 = 위(밝음) ~ 1 = 아래(그늘)
      const h = hash2(i, j >> 1, seed ^ 0x3c31);
      const h2 = hash2(i >> 2, j >> 2, seed ^ 0x9d0f);
      let c = mixc(P_CLIFF_HI, P_CLIFF_MID, Math.min(1, t * 1.7));
      c = mixc(c, P_CLIFF_LO, Math.max(0, t - 0.4) * 1.9);
      c = scalec(c, 0.9 + 0.2 * h);
      if (h2 > 0.6) c = scalec(c, 0.87);
      if (hit === 1) c = scalec(c, 1.14);               // 육지와 맞닿는 밝은 립 — 분리감
      if (hit === CLIFF_DY) c = scalec(c, 0.6);         // 절벽 바닥 — 그림자
      const o = k * 4;
      out[o] = c[0]; out[o + 1] = c[1]; out[o + 2] = c[2];
    }
  }

  // 절벽 위 가장자리 — 햇빛 받는 립(테두리) 하이라이트
  for (let j = 0; j < R; j++) {
    for (let i = 0; i < R; i++) {
      const k = j * R + i;
      if (!land[k]) continue;
      const ii = i + CLIFF_DX, jj = j + CLIFF_DY;
      if (ii >= R || jj >= R) continue;
      if (!land[jj * R + ii]) {
        out[k * 4] = out[k * 4] * 1.09;
        out[k * 4 + 1] = out[k * 4 + 1] * 1.09;
        out[k * 4 + 2] = out[k * 4 + 2] * 1.09;
      }
    }
  }

  // ---- 5패스: 바위 고원 단면 (풀밭 위로 한 단 올라간 지형) ----
  for (let j = 0; j < R; j++) {
    for (let i = 0; i < R; i++) {
      const k = j * R + i;
      if (cls[k] === BLK_ROCK || cls[k] === BLK_WATER) continue;
      let hit = 0;
      for (let kk = 1; kk <= 4; kk++) {
        const jj = j - kk;
        if (jj < 0) break;
        if (cls[jj * R + i] === BLK_ROCK) { hit = kk; break; }
      }
      if (!hit) continue;
      const t = Math.min(1, (hit - 1) / 3);
      const h = hash2(i, j >> 1, seed ^ 0x71c3);
      let c = mixc(rgba(0x777c83), rgba(0x3a3d42), t);
      c = scalec(c, 0.92 + 0.16 * h);
      const o = k * 4;
      out[o] = c[0]; out[o + 1] = c[1]; out[o + 2] = c[2];
    }
  }

  const key = 'island_paint';
  if (scene.textures.exists(key)) scene.textures.remove(key);
  const t = scene.textures.createCanvas(key, R, R);
  if (!t) return;
  const ctx = t.getContext();
  const img = ctx.createImageData(R, R);
  img.data.set(out);
  ctx.putImageData(img, 0, 0);
  t.refresh();
}

export function bakeIslandTexture(scene: Phaser.Scene, data: IslandData): Phaser.GameObjects.RenderTexture {
  // 3/4 뷰: 화면에서 지형이 차지하는 높이는 WORLD_H · sin(47°)
  const rt = scene.add.renderTexture(0, 0, WORLD_W, VIEW_H).setOrigin(0, 0).setDepth(-100);

  const rng = new RNG(data.seed ^ 0x5151);

  // ---- 프리렌더 경로: Blender 로 렌더한 3D 지형 PNG (있으면 그것이 섬의 얼굴) ----
  const mapKey = `island_map_${data.seed}`;
  const preKey = scene.textures.exists(mapKey) ? mapKey : '';
  if (preKey) {
    const img = scene.make.image({ key: preKey, add: false }).setOrigin(0, 0);
    img.setDisplaySize(WORLD_W, VIEW_H);
    rt.draw(img, 0, 0);
    img.destroy();
    return rt;   // 지형에 이미 그림자·절벽·물이 들어 있다
  }

  // 1패스: 그림 지도 (바다 수심 · 해변 · 풀 · 바위) — 블록 이미지를 확대해 굽는다
  paintIsland(scene, data);
  const map = scene.make.image({ key: 'island_paint', add: false }).setOrigin(0, 0);
  map.setScale(WORLD_W / R, (VIEW_H) / R);
  rt.draw(map, 0, 0);
  map.destroy();

  // 1.5패스: 산 — 바위 고원 위 봉우리에 입체 스프라이트 (뒤로 지나가면 캐릭터가 가려진다)
  const peaks: { x: number; y: number; h: number }[] = [];
  for (let y = 2; y < data.h - 2; y++) {
    for (let x = 2; x < data.w - 2; x++) {
      const t = data.tiles[y * data.w + x];
      if (t !== T.ROCK) continue;
      const s = data.shape[y * data.w + x];
      if (s < 0.82) continue;
      let isMax = true;
      for (let dy = -2; dy <= 2 && isMax; dy++) {
        for (let dx = -2; dx <= 2; dx++) {
          if (data.shape[(y + dy) * data.w + (x + dx)] > s) { isMax = false; break; }
        }
      }
      if (isMax) peaks.push({ x: x * TILE + TILE / 2, y: y * TILE + TILE / 2, h: s });
    }
  }
  peaks.sort((a, b) => b.h - a.h);
  const mounts: typeof peaks = [];
  for (const p of peaks) {
    if (mounts.length >= 4) break;
    if (mounts.every((q) => Math.hypot(q.x - p.x, q.y - p.y) > TILE * 7)) mounts.push(p);
  }
  for (const p of mounts) {
    const sc = Phaser.Math.Clamp(1.05 + (p.h - 0.82) * 6, 1.05, 1.9);
    scene.add.image(p.x + 8, p.y + 8, 'fx_shadow').setScale((110 * sc) / 44, (52 * sc) / 22).setAlpha(0.4).setDepth(p.y - 0.01);
    scene.add.image(p.x, p.y + 8, 'd_mount').setOrigin(0.5, 1).setScale(sc).setDepth(p.y);
  }

  // 2패스: 입자 질감 (밋밋함 방지 — 미세한 명/암 점)
  scene.add.tileSprite(0, 0, WORLD_W, WORLD_H, 'grain_a').setOrigin(0, 0).setAlpha(0.045).setDepth(-98);
  const grainB = scene.add.tileSprite(0, 0, WORLD_W, WORLD_H, 'grain_b').setOrigin(0, 0).setAlpha(0.035).setDepth(-97);
  scene.tweens.add({ targets: grainB, tilePositionX: 128, tilePositionY: 64, duration: 11000, repeat: -1, ease: 'Linear' });

  // 3패스: 장식 (풀숲 · 자갈 · 조개)
  const stamp = scene.make.image({ key: 'd_tuft', add: false });
  for (let i = 0; i < 4200; i++) {
    const x = Math.floor(rng.next() * data.w), y = Math.floor(rng.next() * data.h);
    const t = data.tiles[y * data.w + x];
    if (t === T.GRASS || t === T.JUNGLE) {
      stamp.setTexture(rng.chance(0.55) ? 'd_tuft' : 'd_pebble');
      rt.draw(stamp, x * TILE + rng.range(0, 20), y * TILE + rng.range(0, 20), rng.range(0.45, 0.9));
    } else if (t === T.SAND || t === T.SAND_WET) {
      stamp.setTexture('d_shell');
      rt.draw(stamp, x * TILE + rng.range(0, 22), y * TILE + rng.range(0, 22), rng.range(0.5, 1));
    } else if (t === T.ROCK) {
      stamp.setTexture('d_pebble');
      rt.draw(stamp, x * TILE + rng.range(0, 20), y * TILE + rng.range(0, 20), rng.range(0.4, 0.75));
    }
  }
  stamp.destroy();

  // 4패스: 해안 파도 — 물 타일 중 육지에 닿은 곳에 반짝이는 물결 (연출)
  const coast: { x: number; y: number }[] = [];
  for (let y = 1; y < data.h - 1; y++) {
    for (let x = 1; x < data.w - 1; x++) {
      const t = data.tiles[y * data.w + x];
      if (t !== T.WATER && t !== T.WATER_DEEP) continue;
      if (
        data.tiles[idx(x - 1, y)] >= T.SAND_WET || data.tiles[idx(x + 1, y)] >= T.SAND_WET ||
        data.tiles[idx(x, y - 1)] >= T.SAND_WET || data.tiles[idx(x, y + 1)] >= T.SAND_WET
      ) coast.push({ x: x * TILE + TILE / 2, y: y * TILE + TILE / 2 });
    }
  }
  const waveCount = Math.min(130, coast.length);
  for (let i = 0; i < waveCount; i++) {
    const p = coast[Math.floor(rng.next() * coast.length)];
    const w = scene.add
      .image(p.x + rng.range(-16, 16), p.y + rng.range(-16, 16), 'fx_wave')
      .setDepth(-95)
      .setScale(rng.range(0.7, 1.5))
      .setAlpha(0);
    scene.tweens.add({
      targets: w,
      alpha: { from: 0, to: rng.range(0.35, 0.7) },
      y: w.y - 3,
      duration: rng.range(1500, 2800),
      delay: rng.range(0, 2600),
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });
  }

  return rt;
}

/** 미니맵 텍스처 (1타일 = 1픽셀) — UI 에서 확대해 쓴다 */
export function makeMinimapTexture(scene: Phaser.Scene, data: IslandData, key = 'minimap') {
  if (scene.textures.exists(key)) scene.textures.remove(key);
  const t = scene.textures.createCanvas(key, data.w, data.h);
  if (!t) return;
  const ctx = t.getContext();
  const IMG = ctx.createImageData(data.w, data.h);
  const col = (n: number) => [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  const map: Record<number, [number, number, number]> = {
    [T.WATER_DEEP]: col(C.waterDeep) as [number, number, number],
    [T.WATER]: col(C.water) as [number, number, number],
    [T.SAND_WET]: col(C.sandDark) as [number, number, number],
    [T.SAND]: col(C.sand) as [number, number, number],
    [T.GRASS]: col(C.grass) as [number, number, number],
    [T.JUNGLE]: col(C.jungle) as [number, number, number],
    [T.ROCK]: col(C.rock) as [number, number, number],
  };
  for (let i = 0; i < data.w * data.h; i++) {
    const c = map[data.tiles[i]] ?? [0, 0, 0];
    IMG.data[i * 4] = c[0];
    IMG.data[i * 4 + 1] = c[1];
    IMG.data[i * 4 + 2] = c[2];
    IMG.data[i * 4 + 3] = 255;
  }
  ctx.putImageData(IMG, 0, 0);
  t.refresh();
}

export function nodeFamily(kind: string): Family {
  return NODE_KINDS[kind]?.family ?? 'wood';
}

export function familyColor(f: Family): number {
  return FAMILIES[f].color;
}
