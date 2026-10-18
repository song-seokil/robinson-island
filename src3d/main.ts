/**
 * 로빈슨의 섬 — 3D 버전 부트스트랩
 *  · 섬은 Blender 3D 렌더 → GLB(Draco) 로 들어온다 (public/glb/island_<seed>.glb)
 *  · 좌표 규약: 지상 좌표(x, y) = 월드(X, Z), 1타일 = 32px → 게임 좌표 / 32
 *  · 카메라: 3/4 부감(기본 47°). 돌리기=드래그, 줌=휠
 */
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import { AnimationMixer } from 'three';
import dracoWasm from 'three/examples/jsm/libs/draco/draco_decoder.wasm?url';
import dracoJs from 'three/examples/jsm/libs/draco/draco_wasm_wrapper.js?url';

// ---------- 월드 규약 ----------
export const TILE = 32;
export const MAP_TILES = 68;
export const WORLD = MAP_TILES;              // 68 Blender 단위 = 68 타일
/** 게임 좌표 → 3D 월드 좌표 */
export function toWorld(gx: number, gy: number): [number, number] {
  return [gx / TILE, gy / TILE];
}

// ---------- 렌더러 ----------
const canvas = document.createElement('canvas');
document.body.appendChild(canvas);

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0a1a2a);
scene.fog = new THREE.Fog(0x0a1a2a, 90, 240);

const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.5, 800);
const CLOSE_UP = new URLSearchParams(location.search).has('stage');
const CX = WORLD / 2, CZ = WORLD / 2;
if (CLOSE_UP) {
  camera.position.set(CX - 5.5, 4.2, CZ + 7.5);   // 생존자 클로즈업
} else {
  camera.position.set(CX - 34, 46, CZ + 62);
}

const controls = new OrbitControls(camera, canvas);
controls.target.set(CX, CLOSE_UP ? 1.0 : 0, CZ);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
// 맵 고정 + 줌인아웃 (18-15): 카메라는 맵 위를 오가며 확대/축소만 한다
controls.minDistance = 18;
controls.maxDistance = 120;
// ---- 360° 자유 회전: 지면 아래로만 못 내려감 (0° = 정수평, 90° = 수평)
controls.maxPolarAngle = Math.PI * 0.495;
controls.minPolarAngle = 0.0;
controls.enablePan = true;
controls.screenSpacePanning = false;
controls.rotateSpeed = 0.85;
controls.zoomSpeed = 0.9;

// ---- 시점 프리셋 (18-15): 맵 고정 + 줌인아웃. 캐릭터에 고정되지 않는다 ----
//  CoC 방식 — 섬 중심 고정. 카메라는 맵 위를 돌아다니며 확대/축소만 한다.
const VIEW_PRESETS = [
  { name: '맵 기본', polar: Math.PI * 0.32, azim: Math.PI * 0.22, dist: 76, pan: 0 },
  { name: '확대', polar: Math.PI * 0.31, azim: Math.PI * 0.22, dist: 36, pan: 0 },
  { name: '지역 보기', polar: Math.PI * 0.30, azim: Math.PI * 0.22, dist: 23, pan: 1 },
  { name: '살짝 돌려보기', polar: Math.PI * 0.33, azim: Math.PI * 0.50, dist: 76, pan: 0 },
  { name: '고개俯視', polar: Math.PI * 0.10, azim: Math.PI * 0.22, dist: 88, pan: 0 },
];
let presetIdx = 0;
function applyPreset(i: number) {
  const p = VIEW_PRESETS[(i + VIEW_PRESETS.length) % VIEW_PRESETS.length];
  presetIdx = (i + VIEW_PRESETS.length) % VIEW_PRESETS.length;
  const t = p.pan && hero ? panTo(hero.position.x, hero.position.y, hero.position.z)
                          : new THREE.Vector3(CX, 0, CZ);
  const off = new THREE.Vector3(
    Math.sin(p.azim) * Math.cos(p.polar),
    Math.sin(p.polar),
    Math.cos(p.azim) * Math.cos(p.polar),
  ).multiplyScalar(p.dist);
  camTween = { from: camera.position.clone(), to: t.clone().add(off), t: 0, target: t.clone() };
}

/** 월드좌표 → 맵 중심 기준 화면 배율(x,y,z = -1..1) */
function panTo(wx: number, wy: number, wz: number): THREE.Vector3 {
  const u = Math.max(-0.42, Math.min(0.42, wx / WORLD));
  const v = Math.max(-0.42, Math.min(0.42, wz / WORLD));
  const n = WORLD / 2;
  return new THREE.Vector3(CX + u * n, 0, CZ + v * n);
}
const heroPosX = () => (hero ? hero.position.x : 0);
const heroPosY = () => (hero ? hero.position.y + 0.85 : 0);
const heroPosZ = () => (hero ? hero.position.z : 0);
void heroPosX; void heroPosY; void heroPosZ;
let camTween: { from: THREE.Vector3; to: THREE.Vector3; t: number; target?: THREE.Vector3 } | null = null;
window.addEventListener('keydown', (e) => {
  if (e.code === 'KeyV') applyPreset(presetIdx + 1);
  if (e.code === 'KeyB') applyPreset(presetIdx - 1);
});

// ---------- 조명(우리 아트 방향: 좌상단, 낮은 태양) ----------
const hemi = new THREE.HemisphereLight(0xbfe0ff, 0x4a6a48, 0.85);
scene.add(hemi);

const sun = new THREE.DirectionalLight(0xfff2d8, 2.6);
sun.position.set(WORLD / 2 - 40, 60, WORLD / 2 + 26);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.near = 10;
sun.shadow.camera.far = 260;
sun.shadow.camera.left = -80;
sun.shadow.camera.right = 80;
sun.shadow.camera.top = 80;
sun.shadow.camera.bottom = -80;
sun.shadow.bias = -0.0009;
scene.add(sun);
scene.add(new THREE.AmbientLight(0x9fc4e8, 0.28));

// ---------- 섬 로드 ----------
const status = document.getElementById('hud') as HTMLDivElement;
const draco = new DRACOLoader();
// Vite 로 번들된 드라코 디코더 경로를 명시 (기본값은 CDN/상대경로로 틀어짐)
draco.setDecoderPath({ js: dracoJs, wasm: dracoWasm });
draco.preload();

const gltf = new GLTFLoader();
gltf.setDRACOLoader(draco);

const params = new URLSearchParams(location.search);
const seed = params.get('seed') ?? '824934';
let worldSpan = { x: WORLD, z: WORLD };
loadRules(seed);

gltf.load(`/glb/island_${seed}.glb`, (g) => {
  const root = g.scene;
  root.traverse((o) => {
    const m = (o as THREE.Mesh).material as THREE.Material | undefined;
    if (!m) return;
    (Array.isArray(m) ? m : [m]).forEach((mm) => {
      mm.side = THREE.FrontSide;
      (mm as THREE.MeshStandardMaterial).vertexColors = true;
    });
    o.castShadow = false;
    o.receiveShadow = true;
    if ((o as THREE.Mesh).isMesh) groundMeshes.push(o as THREE.Mesh);
  });
  scene.add(root);
  // 좌표 규약 맞춤: 지형의 최소 모서리를 (0,0,0) 으로 옮긴다 (바다면 = y 0)
  // (Blender Z-up → glTF Y-up 변환 때문에 섬이 z<0 에 놓여 있다)
  const bb = new THREE.Box3().setFromObject(root);
  root.position.x -= bb.min.x;
  root.position.z -= bb.min.z;
  root.position.y -= bb.min.y;
  root.updateMatrixWorld(true);
  const bb2 = new THREE.Box3().setFromObject(root);
  worldSpan = { x: bb2.max.x - bb2.min.x, z: bb2.max.z - bb2.min.z };
  status.textContent = `로빈슨의 섬 · 3D · 시드 ${seed} · ${WORLD}×${WORLD}타일`;
  (window as unknown as { __island?: THREE.Object3D }).__island = root;
}, undefined, (err) => {
  status.textContent = `섬 로드 실패: ${err}`;
});

// ---------- CoC 룩: 3단 툰 음영 + 두꺼운 외곽선 ----------
/** 툰 셰이딩 그라디언트 (4톤) — CoC 처럼 평평한 색면으로 */
function toonGradient(): THREE.DataTexture {
  const steps = new Uint8Array([86, 148, 205, 255]);
  const tex = new THREE.DataTexture(steps, steps.length, 1, THREE.RedFormat);
  tex.minFilter = tex.magFilter = THREE.NearestFilter;
  tex.needsUpdate = true;
  return tex;
}
const GRAD = toonGradient();

/** 역방향 껍질(inverted hull) 외곽선 — 시그니처적인 두꺼운 윤곽선 */
const OUTLINE = new THREE.ShaderMaterial({
  side: THREE.BackSide,
  uniforms: { thick: { value: 0.016 }, ink: { value: new THREE.Color(0x2a1c11) } },
  vertexShader: `
    uniform float thick;
    void main() {
      vec3 p = position + normal * thick;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
    }`,
  fragmentShader: `
    uniform vec3 ink;
    void main() { gl_FragColor = vec4(ink, 1.0); }`,
});

/** 메시에 툰재질 + 외곽선 추가 */
function cocify(roots: THREE.Object3D[], ink = 0.016) {
  for (const root of roots) {
    const todo: THREE.Mesh[] = [];
    root.traverse((o) => { if ((o as THREE.Mesh).isMesh) todo.push(o as THREE.Mesh); });
    for (const mesh of todo) {
      const geo = mesh.geometry;
      // 툰 재질로 교체 (색은 원래 재질에서 유지)
      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      const toon = mats.map((m) => {
        const sm = m as THREE.MeshStandardMaterial;
        const base = sm.color ?? new THREE.Color(0xcccccc);
        const hasMap = !!sm.map;
        return new THREE.MeshToonMaterial({
          color: base,
          gradientMap: GRAD,
          map: sm.map ?? null,          // 텍스처(그림 투영) 유지
          alphaTest: hasMap ? 0.35 : 0,
          transparent: hasMap ? false : sm.transparent,
        });
      });
      mesh.material = Array.isArray(mesh.material) ? toon : toon[0];
      mesh.castShadow = true;
      mesh.receiveShadow = true;

      // 외곽선 복제본
      const om = OUTLINE.clone();
      om.uniforms = THREE.UniformsUtils.clone(OUTLINE.uniforms);
      om.uniforms.thick.value = ink;
      const line = new THREE.Mesh(geo, om);
      line.castShadow = false;
      line.receiveShadow = false;
      line.frustumCulled = mesh.frustumCulled;
      const sk = (mesh as THREE.SkinnedMesh).isSkinnedMesh ? (mesh as THREE.SkinnedMesh) : null;
      if (sk && sk.skeleton) {
        const sm = new THREE.SkinnedMesh(geo, om);
        sm.bind(sk.skeleton, sk.bindMatrix);
        sm.castShadow = false;
        mesh.add(sm);
      } else {
        mesh.add(line);
      }
    }
  }
}

// ---------- 생존자 (Blender 리그 + 5종 클립) ----------
const mixer = new AnimationMixer(scene);
let hero: THREE.Object3D | null = null;
let clips: THREE.AnimationClip[] = [];
let current = '';
const KEYS: Record<string, string> = { '1': 'Idle', '2': 'Walk', '3': 'Attack', '4': 'Hit' };
const MOVE: Record<string, [number, number]> = {
  KeyW: [0, -1], KeyS: [0, 1], KeyA: [-1, 0], KeyD: [1, 0],
  ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0],
};
const held = new Set<string>();

function play(name: string, loop = true) {
  if (!hero) return;
  const clip = clips.find((c) => c.name === name);
  if (!clip) return;
  mixer.stopAllAction();
  const act = mixer.clipAction(clip);
  act.reset().play();
  if (!loop) act.setLoop(THREE.LoopOnce, 1);
  act.clampWhenFinished = !loop;
  current = name;
  status.textContent = `로빈슨 · ${name} · WASD 이동 / 1-4 동작`;
}

// 생존자 3상태 — 0 난파 / 1 1일차 / 2 적응완료
const params0 = new URLSearchParams(location.search);
const startStage = Math.max(0, Math.min(2, Number(params0.get('stage') ?? 2)));
gltf.load(`/glb/robinson_s${startStage}.glb`, (g) => {
  hero = g.scene;
  hero.position.set(WORLD / 2, 0, WORLD / 2);
  scene.add(hero);
  grounded = false;
  clips = g.animations;
  (window as unknown as { __hero?: unknown }).__hero = { hero, clips, mixer, play };
  play(clips.some((c) => c.name === 'Walk') ? 'Walk' : clips[0]?.name ?? 'Idle');
}, undefined, (err) => { console.warn('[hero]', err); });

// ---------- 지형 위에서 걷기 (레이캐스트로 높이 샘플) ----------
const ray = new THREE.Raycaster();
const down = new THREE.Vector3(0, -1, 0);
let groundMeshes: THREE.Mesh[] = [];
let grounded = false;

// ---------- 섬 규칙 데이터 (Phaser 없이 JSON 으로 받는다) ----------
interface IslandRules {
  map: number; spawn: { x: number; y: number };
  mesas: { cx: number; cy: number; R: number; top: number }[];
  terrain: string | null; hasRiver: boolean;
  elev: Float32Array; steep: Uint8Array; ramp: Uint8Array;
}
let RULES: IslandRules | null = null;

function loadRules(seed: string) {
  fetch(`/island/island_${seed}.json`)
    .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
    .then((j: any) => {
      const map = j.map;
      const dec = (b64: string, Ctor: any) => {
        const bin = atob(b64);
        const buf = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
        return new Ctor(buf.buffer);
      };
      RULES = {
        map, spawn: j.spawn, mesas: j.mesas ?? [],
        terrain: j.terrain, hasRiver: j.hasRiver,
        elev: dec(j.elev, Float32Array), steep: dec(j.steep, Uint8Array), ramp: dec(j.ramp, Uint8Array),
      };
      (window as unknown as { __rules?: IslandRules }).__rules = RULES;
      // 해변 스폰 지점에 세운다
      if (hero) placeAtSpawn();
    })
    .catch((e) => { console.warn('[rules]', e); });
}

const inMap = (x: number, z: number) => !!RULES && x >= 0 && z >= 0 && x < RULES.map && z < RULES.map;

/** 이 타일로 걸어갈 수 있는가 (18-10 절벽·계간 규칙) */
function walkable(tx: number, ty: number): boolean {
  if (!RULES) return true;
  const m = RULES.map;
  if (tx < 0 || ty < 0 || tx >= m || ty >= m) return false;
  const i = ty * m + tx;
  return RULES.steep[i] === 0 && RULES.elev[i] > -0.2;   // 물·절벽 불가
}

function placeAtSpawn() {
  if (!hero || !RULES) return;
  const tx = Math.floor(RULES.spawn.x / 32), ty = Math.floor(RULES.spawn.y / 32);
  // 스폰 주변에서 '사방이 열려 있는' 자리를 찾는다 (막다른 해변이면 답답함)
  let best = { x: tx, y: ty, open: -1, gy: -99 };
  for (let r = 0; r < 10; r++) {
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        const x = tx + dx, y = ty + dy;
        if (!walkable(x, y)) continue;
        let open = 0;
        for (const [ox, oy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as [number, number][]) {
          if (walkable(x + ox, y + oy) && walkable(x + ox * 2, y + oy * 2)) open++;
        }
        if (open > best.open) {
          const g = groundAt(x + 0.5, y + 0.5);
          if (g !== null) best = { x, y, open, gy: g };
        }
      }
    }
    if (best.open >= 3) break;
  }
  if (best.gy > -90) {
    hero.position.set(best.x + 0.5, best.gy, best.y + 0.5);
    hero.rotation.y = Math.PI * 0.15;
    grounded = true;
    cocify([hero], 0.013);
    // 시점은 맵 고정(CoC 방식) — 크루조가 움직여도 카메라 안 따라간다
    const m = RULES.mesas[0];
    status.textContent = `도착 · ${RULES.terrain ?? ''}${RULES.hasRiver ? ' · 강' : ''}`
      + `${m ? ` · 산 ${m.R}타일` : ''} · WASD 이동 / 휠=줌 / V 시점 / 1-4 동작`;
  }
}

function groundAt(x: number, z: number): number | null {
  ray.set(new THREE.Vector3(x, 60, z), down);
  const hit = ray.intersectObjects(groundMeshes, false)[0];
  return hit ? hit.point.y : null;
}

let placed = false;
/** 섬 · 생존자 · 규칙이 모두 준비되면 해변 스폰에 배치 */
function maybePlace() {
  if (placed || !hero || !groundMeshes.length || !RULES) return;
  placeAtSpawn();
  if (grounded) placed = true;
}

function stepHero(dt: number) {
  if (!hero) return;
  if (!placed) { maybePlace(); return; }
  if (!grounded) {
    const y = groundAt(hero.position.x, hero.position.z);
    if (y !== null) { hero.position.y = y; grounded = true; cocify([hero], 0.013); }
    return;
  }
  let dx = 0, dz = 0;
  for (const k of held) { const m = MOVE[k]; if (m) { dx += m[0]; dz += m[1]; } }
  if (dx || dz) {
    const len = Math.hypot(dx, dz);
    const sp = 4.2 * dt;
    const tryMove = (nx: number, nz: number): boolean => {
      const g = groundAt(nx, nz);
      if (g === null) return false;
      if (RULES && !walkable(Math.floor(nx), Math.floor(nz))) return false;  // 절벽·물 불가
      const cur = hero.position.y;
      const dist = Math.hypot(nx - hero.position.x, nz - hero.position.z);
      if (dist > 1e-4) {
        const grad = Math.abs(cur - g) / dist;
        if (grad > 0.62) return false;                      // 급경사(계간/절벽)는 못 감
      }
      hero.position.set(nx, g, nz);
      return true;
    };
    // 서브스텝: 경계에 부딪히면 그립을 따라 미끄러진다
    const SUB = 4;
    let moved = false;
    for (let s = 0; s < SUB; s++) {
      const ax = (dx / len) * (sp / SUB), az = (dz / len) * (sp / SUB);
      if (tryMove(hero.position.x + ax, hero.position.z + az)) { moved = true; continue; }
      if (tryMove(hero.position.x + ax, hero.position.z)) { moved = true; continue; }
      if (tryMove(hero.position.x, hero.position.z + az)) { moved = true; continue; }
      break;
    }
    if (!moved) { /* 막힘 */ }
    const ang = Math.atan2(dx / len, dz / len) * (180 / Math.PI);
    hero.rotation.y += (((ang + 180) - hero.rotation.y + 540) % 360) - 180;
    if (current !== 'Walk') play('Walk');
  } else if (current === 'Walk') {
    play('Idle');
  }
}

// ---------- 루프 ----------
function resize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}
window.addEventListener('resize', resize);

window.addEventListener('keydown', (e) => {
  const n = KEYS[e.key];
  if (n) { play(n, n !== 'Attack' && n !== 'Hit'); return; }
  if (MOVE[e.code]) held.add(e.code);
});
window.addEventListener('keyup', (e) => held.delete(e.code));

let prev = performance.now();

/** 한 프레임 진행 — RAF 없이도手动으로 돌릴 수 있게 노출(테스트/백그라운드 탭용) */
export function tick(dt = 1 / 60) {
  stepHero(dt);
  if (camTween) {
    camTween.t = Math.min(1, camTween.t + dt * 2.2);
    const e = 1 - Math.pow(1 - camTween.t, 3);
    camera.position.lerpVectors(camTween.from, camTween.to, e);
    if (camTween.target) controls.target.lerp(camTween.target, e);
    if (camTween.t >= 1) camTween = null;
  }
  mixer.update(dt);
  controls.update();
  renderer.render(scene, camera);
}

renderer.setAnimationLoop((t) => {
  const dt = Math.min(0.05, (t - prev) / 1000);
  prev = t;
  tick(dt);
});

// 디버그 훅
(window as unknown as { __three?: unknown }).__three = { scene, camera, renderer, controls, groundMeshes, groundAt, isGrounded: () => grounded, tick };