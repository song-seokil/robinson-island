// 게임 섬 생성기 → Blender용 지형 데이터 덤프
//   사용: node export-island.cjs <seed> [res]
//   산출: tools/blender/out/{shape.f32, moist.f32, tiles.u8, meta.json}
//         shape/moist 는 게임 타일 격자(68×68)를 RES×RES 로 bilinear 확장
const Module = require('module');
const orig = Module._load;
Module._load = function (req) {
  if (req === 'phaser') return { default: {} };
  return orig.apply(this, arguments);
};
const fs = require('fs');
const path = require('path');
const { generateIsland } = require('./_bundle.cjs');

const MAP = 68, TILE = 32;
const seed = Number(process.argv[2] || 824934);
const RES = Number(process.argv[3] || 1088);

function upsample(src, N) {
  const out = new Float32Array(N * N);
  for (let j = 0; j < N; j++) {
    const fy = (j / N) * MAP - 0.5;
    const iy = Math.floor(fy);
    const y0 = Math.max(0, Math.min(MAP - 1, iy));
    const y1 = Math.max(0, Math.min(MAP - 1, iy + 1));
    const ty = Math.max(0, Math.min(1, fy - iy));
    for (let i = 0; i < N; i++) {
      const fx = (i / N) * MAP - 0.5;
      const ix = Math.floor(fx);
      const x0 = Math.max(0, Math.min(MAP - 1, ix));
      const x1 = Math.max(0, Math.min(MAP - 1, ix + 1));
      const tx = Math.max(0, Math.min(1, fx - ix));
      const a = src[y0 * MAP + x0], b = src[y0 * MAP + x1];
      const c = src[y1 * MAP + x0], d = src[y1 * MAP + x1];
      out[j * N + i] = (a * (1 - tx) + b * tx) * (1 - ty) + (c * (1 - tx) + d * tx) * ty;
    }
  }
  return out;
}

const isl = generateIsland(seed);
const shape = upsample(isl.shape, RES);
const moist = upsample(isl.moist, RES);

const outDir = process.env.B3D_DATA || 'C:/Users/oocss/AppData/Local/Temp/opencode/b3d/data';
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, 'shape.f32'), Buffer.from(shape.buffer));
fs.writeFileSync(path.join(outDir, 'moist.f32'), Buffer.from(moist.buffer));
fs.writeFileSync(path.join(outDir, 'tiles.u8'), Buffer.from(isl.tiles.buffer, isl.tiles.byteOffset, isl.tiles.length));
// 지형 고도·계간·경사 (게임과 렌더가 같은 데이터를 쓴다)
fs.writeFileSync(path.join(outDir, 'elev.f32'), Buffer.from(isl.elev.buffer, isl.elev.byteOffset, isl.elev.byteLength));
fs.writeFileSync(path.join(outDir, 'ramp.u8'), Buffer.from(isl.ramp.buffer, isl.ramp.byteOffset, isl.ramp.length));
fs.writeFileSync(path.join(outDir, 'steep.u8'), Buffer.from(isl.steep.buffer, isl.steep.byteOffset, isl.steep.length));

const meta = {
  seed,
  map: MAP,
  res: RES,
  tile: TILE,
  worldW: MAP * TILE,
  worldH: MAP * TILE,
  center: isl.center,
  spawn: isl.spawn,
  trait: isl.trait?.id ?? null,
  nodes: isl.nodes,
};
fs.writeFileSync(path.join(outDir, 'meta.json'), JSON.stringify(meta));
console.log(JSON.stringify({ seed, RES, trait: meta.trait, nodes: isl.nodes.length }));