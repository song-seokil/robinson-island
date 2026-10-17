/** 시드 기반 난수 + 값 노이즈(섬 생성용) */

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class RNG {
  private f: () => number;
  constructor(seed: number) {
    this.f = mulberry32(seed);
  }
  next(): number { return this.f(); }
  range(a: number, b: number): number { return a + this.f() * (b - a); }
  int(a: number, b: number): number { return Math.floor(this.range(a, b + 1)); }
  pick<T>(arr: T[]): T { return arr[Math.floor(this.f() * arr.length)]; }
  chance(p: number): boolean { return this.f() < p; }
  sign(): number { return this.f() < 0.5 ? -1 : 1; }
}

/**
 * 격자 값 노이즈 (bilinear). 좌표는 0..size 범위를 순환(wrap)한다.
 * 여러 옥타브를 합성하면 자연스러운 섬 지형이 나온다.
 */
export class ValueNoise {
  private grid: Float32Array;
  private size: number;
  constructor(seed: number, size = 16) {
    this.size = size;
    const rng = new RNG(seed);
    this.grid = new Float32Array(size * size);
    for (let i = 0; i < this.grid.length; i++) this.grid[i] = rng.next();
  }
  private at(x: number, y: number): number {
    const s = this.size;
    const xi = ((x % s) + s) % s;
    const yi = ((y % s) + s) % s;
    return this.grid[yi * s + xi];
  }
  /** u,v ∈ [0,1] */
  sample(u: number, v: number): number {
    const x = u * this.size;
    const y = v * this.size;
    const x0 = Math.floor(x), y0 = Math.floor(y);
    const fx = x - x0, fy = y - y0;
    const sx = fx * fx * (3 - 2 * fx);
    const sy = fy * fy * (3 - 2 * fy);
    const a = this.at(x0, y0), b = this.at(x0 + 1, y0);
    const c = this.at(x0, y0 + 1), d = this.at(x0 + 1, y0 + 1);
    return (a + (b - a) * sx) * (1 - sy) + (c + (d - c) * sx) * sy;
  }
  /** 여러 옥타브 합성 (0..1) */
  fbm(u: number, v: number, octaves = 3, gain = 0.5, lac = 2): number {
    let sum = 0, amp = 1, norm = 0, freq = 1;
    for (let i = 0; i < octaves; i++) {
      sum += this.sample(u * freq, v * freq) * amp;
      norm += amp;
      amp *= gain;
      freq *= lac;
    }
    return sum / norm;
  }
}
