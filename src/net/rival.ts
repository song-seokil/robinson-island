/**
 * 상대 섬(약탈 대상) 공급자 — "서버 없이" 다른 유저 섬을 얻는 방법.
 *
 *  A. AiRivalProvider   : 게임이 절차적으로 만든 상대 섬. 서버 0. 완전 오프라인.
 *  B. CodeRivalProvider : 친구가 보내준 초대 코드(문자열/QR)로 진짜 유저 섬을 약탈. 서버 0.
 *  C. CloudRivalProvider: (나중에 옵션) Supabase/Firebase 무료 티어에서 섬 배치도만 주고받는다.
 *                         → 내가 관리하는 서버는 여전히 없다. 이 인터페이스만 구현하면 끝.
 *
 * 약탈 전투 자체는 항상 "내 기기에서" 시뮬레이션하므로 서버가 필요 없다.
 */

import { BuildId, Cost, Family, LEVEL_MAX } from '../core/config';
import { SavedBuilding } from '../core/state';
import { RNG } from '../core/rng';

export interface RivalGuard { kind: string; x: number; y: number; }

export interface RivalIsland {
  code: string;             // 초대 코드 (내보내기/공유용)
  name: string;             // 상대 이름
  power: number;            // 위협도(대략 1 ~ ∞)
  seed: number;
  layout: SavedBuilding[];  // 건물 배치 (월드 좌표 아님 — 상대 섬 로컬 좌표, 타일 단위)
  guards: RivalGuard[];     // 수비 유닛
  loot: Cost;               // 약탈 성공 시 획득
  source: 'ai' | 'code' | 'cloud';
}

export interface RivalProvider {
  id: 'ai' | 'code' | 'cloud';
  label: string;
  available(): boolean;
  /** playerPower: 내 전력 → 비슷한 상대를 매칭. avoid: 이미 깬 상대 코드 */
  next(playerPower: number, avoid?: string[]): Promise<RivalIsland | null>;
}

// ============================================================
// A. AI 상대 섬
// ============================================================
const NAME_A = ['붉은', '검은', '성난', '고요한', '은빛', '저주받은', '미친', '해골', '폭풍의', '배고픈', '사나운', '노련한'];
const NAME_B = ['수염단', '파도', '항해사', '약탈자', '함대', '두목', '무리', '해적단', '갈매기', '상어', '해적', '밀수꾼'];

let aiCounter = 0;

export class AiRivalProvider implements RivalProvider {
  id = 'ai' as const;
  label = '무인도 해적 (AI)';
  available() { return true; }

  async next(playerPower: number, avoid: string[] = []): Promise<RivalIsland> {
    // 매번 다른 섬: 코드 문자열 자체를 시드로 쓴다.
    const code = `AI-${Date.now().toString(36)}-${(aiCounter++).toString(36)}`;
    const isl = buildRivalFromSeed(hashStr(code), code, 'ai');
    // 내 전력에 맞춰 스케일
    const k = Math.max(0.6, Math.min(3.2, playerPower / Math.max(1, isl.power)));
    if (k !== 1) scaleRival(isl, k);
    if (avoid.includes(isl.code)) isl.name += ' (재도전)';
    return isl;
  }
}

/** 시드로 상대 섬을 절차 생성 (공유 코드로 복원할 때도 동일 함수 사용) */
export function buildRivalFromSeed(seed: number, code: string, source: RivalIsland['source']): RivalIsland {
  const rng = new RNG(seed);
  const power = Math.round(6 + rng.range(0, 26));
  const name = `${rng.pick(NAME_A)}${rng.pick(NAME_B)} Lv.${Math.max(1, Math.round(power / 4))}`;

  const layout: SavedBuilding[] = [];
  const guards: RivalGuard[] = [];

  // 코어: 보물 상자 + 오두막
  layout.push({ key: 'chest', x: 0, y: 0, hp: 200 });
  layout.push({ key: 'hut', x: 2, y: -1, hp: 150 });

  const towers = Math.max(1, Math.round(power / 5));
  const walls = Math.round(power * 1.1);
  const spikes = Math.max(0, Math.round(power / 6));

  // 감시탑을 코어 주변 링에 배치
  for (let i = 0; i < towers; i++) {
    const a = (i / towers) * Math.PI * 2 + rng.range(-0.2, 0.2);
    const r = 3 + rng.range(0, 1.6);
    layout.push({ key: 'tower', x: Math.round(Math.cos(a) * r), y: Math.round(Math.sin(a) * r), hp: 170 });
  }
  // 팔리사드: 코어 주변 성벽 (룰렛)
  for (let i = 0; i < walls; i++) {
    const a = rng.range(0, Math.PI * 2);
    const r = 4.6 + rng.range(0, 1.2);
    const x = Math.round(Math.cos(a) * r), y = Math.round(Math.sin(a) * r);
    if (layout.some((b) => b.x === x && b.y === y)) continue;
    layout.push({ key: 'wall', x, y, hp: 90 });
  }
  for (let i = 0; i < spikes; i++) {
    const a = rng.range(0, Math.PI * 2);
    const r = rng.range(2.2, 3.4);
    layout.push({ key: 'spikes', x: Math.round(Math.cos(a) * r), y: Math.round(Math.sin(a) * r), hp: 55 });
  }

  // 수비 유닛
  guards.push({ kind: 'boss', x: 0, y: 0 });
  const gk = ['raider', 'archer', 'bomber'];
  for (let i = 0; i < Math.round(power / 3); i++) {
    const a = rng.range(0, Math.PI * 2);
    const r = rng.range(1.2, 3.2);
    guards.push({ kind: rng.pick(gk), x: +Math.cos(a).toFixed(2) * r, y: +Math.sin(a).toFixed(2) * r });
  }

  const loot: Cost = {
    crystal: Math.max(1, Math.round(power / 8)),
    oil: Math.max(1, Math.round(power / 5)),
    wood: Math.round(power * 2),
    stone: Math.round(power * 1.6),
  };

  return { code, name, power, seed, layout, guards, loot, source };
}

export function scaleRival(isl: RivalIsland, k: number) {
  isl.power = Math.round(isl.power * k);
  if (isl.loot) {
    for (const key of Object.keys(isl.loot) as (keyof Cost)[]) {
      const v = isl.loot[key];
      if (typeof v === 'number') isl.loot[key] = Math.max(1, Math.round(v * k));
    }
  }
}

function hashStr(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

// ============================================================
// B. 초대 코드 (친구 섬 공유) — 서버 없음
// ============================================================
export interface SharedBase {
  v: 1;
  n: string;                  // 플레이어 이름
  p: number;                  // 전력
  b: [BuildId, number, number, number][];   // [종류, x타일, y타일, hp]
  g: [string, number, number][];            // 수비 유닛
}

/** 내 섬 배치를 공유 코드로 내보내기 (압축 + base64url) */
export async function encodeShareCode(base: SharedBase): Promise<string> {
  const json = JSON.stringify(base);
  const bytes = new TextEncoder().encode(json);
  const packed = await tryDeflate(bytes);
  const b64 = toBase64Url(packed);
  return `RSI1-${b64}`;
}

export async function decodeShareCode(code: string): Promise<RivalIsland | null> {
  try {
    const trimmed = code.trim().replace(/\s+/g, '');
    if (!trimmed.startsWith('RSI1-')) return null;
    const raw = fromBase64Url(trimmed.slice(5));
    const bytes = await tryInflate(raw);
    const base = JSON.parse(new TextDecoder().decode(bytes)) as SharedBase;
    if (!base || base.v !== 1 || !Array.isArray(base.b)) return null;
    return {
      code: trimmed,
      name: base.n || '이름 없는 약탈자',
      power: base.p || 10,
      seed: hashStr(trimmed),
      layout: base.b.map(([key, x, y, hp]) => ({ key, x, y, hp })),
      guards: base.g.map(([kind, x, y]) => ({ kind, x, y })),
      loot: { wood: 40, food: 6 },   // 친구 섬 전리품 (추후 전력 기반으로 확장)
      source: 'code',
    };
  } catch {
    return null;
  }
}

/** 친구가 보낸 코드를 받아 플레이하는 공급자 */
export class CodeRivalProvider implements RivalProvider {
  id = 'code' as const;
  label = '친구 섬 (초대 코드)';
  private queue: RivalIsland[] = [];
  available() { return this.queue.length > 0; }
  push(isl: RivalIsland) { this.queue.push(isl); }
  async next(): Promise<RivalIsland | null> {
    return this.queue.shift() ?? null;
  }
}

// ============================================================
// C. 클라우드 매칭 (옵션 — 지금은 자리만)
// ============================================================
export class CloudRivalProvider implements RivalProvider {
  id = 'cloud' as const;
  label = '전 세계 무작위 상대 (준비 중)';
  private enabled = false;
  available() { return this.enabled; }
  async next(): Promise<RivalIsland | null> {
    // Supabase/Firebase 무료 티어 연동 지점.
    // 예: const { data } = await supabase.from('islands').select().limit(1).single();
    return null;
  }
}

// ============================================================
// 관리자 — 게임은 이 인터페이스만 알면 된다
// ============================================================
class RivalManager {
  ai = new AiRivalProvider();
  code = new CodeRivalProvider();
  cloud = new CloudRivalProvider();

  private forced: RivalIsland | null = null;

  setForced(isl: RivalIsland | null) { this.forced = isl; }
  getForced() { return this.forced; }

  async matchmake(playerPower: number, avoided: string[] = []): Promise<RivalIsland> {
    if (this.forced) { const f = this.forced; this.forced = null; return f; }
    if (this.code.available()) {
      const r = await this.code.next();
      if (r) return r;
    }
    if (this.cloud.available()) {
      const r = await this.cloud.next();
      if (r) return r;
    }
    return this.ai.next(playerPower, avoided);
  }
}

export const rivals = new RivalManager();

/** 섬 성장도 → 대략적 전력 계산 (매칭용) */
export function estimatePower(nodeLevels: number[], buildings: number, kills: number): number {
  const avg = nodeLevels.length ? nodeLevels.reduce((a, b) => a + b, 0) / nodeLevels.length : 1;
  return Math.round(avg * 3 + buildings * 2 + kills * 0.5 + LEVEL_MAX * 0.2);
}

export function familyTotal(levels: number[], kinds: string[], famOf: (kind: string) => Family, fam: Family): number {
  let s = 0;
  for (let i = 0; i < levels.length; i++) if (famOf(kinds[i]) === fam) s += levels[i];
  return s;
}

// ---------- 압축 유틸 (CompressionStream 있으면 gzip, 없으면 평문) ----------
async function tryDeflate(bytes: Uint8Array): Promise<Uint8Array> {
  const g = globalThis as { CompressionStream?: new (f: string) => unknown };
  if (!g.CompressionStream) return bytes;
  try {
    const cs = new CompressionStream('gzip') as unknown as { readable: ReadableStream<Uint8Array>; writable: WritableStream<Uint8Array> };
    const stream = new Blob([bytes as unknown as BlobPart]).stream().pipeThrough(cs as unknown as TransformStream<Uint8Array, Uint8Array>);
    return new Uint8Array(await new Response(stream).arrayBuffer());
  } catch {
    return bytes;
  }
}

async function tryInflate(bytes: Uint8Array): Promise<Uint8Array> {
  const g = globalThis as { DecompressionStream?: new (f: string) => unknown };
  // gzip 매직넘버(1f 8b)가 아니면 평문
  if (!g.DecompressionStream || bytes.length < 2 || bytes[0] !== 0x1f || bytes[1] !== 0x8b) return bytes;
  const ds = new DecompressionStream('gzip') as unknown as { readable: ReadableStream<Uint8Array>; writable: WritableStream<Uint8Array> };
  const stream = new Blob([bytes as unknown as BlobPart]).stream().pipeThrough(ds as unknown as TransformStream<Uint8Array, Uint8Array>);
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

function toBase64Url(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(s: string): Uint8Array {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (s.length % 4)) % 4);
  const raw = atob(b64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}
