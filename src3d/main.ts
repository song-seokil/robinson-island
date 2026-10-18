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
scene.background = new THREE.Color(0x8fd0ef);
scene.fog = new THREE.Fog(0x9fdcf5, 120, 460);

/** 하늘 돔 — 지평선(아래는 바다색)부터 하늘색까지 그라디언트 */
const SKY = new THREE.Mesh(
  new THREE.SphereGeometry(700, 24, 16),
  new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: {
      top: { value: new THREE.Color(0x2f7fc4) },
      mid: { value: new THREE.Color(0x9fdcf5) },
      bottom: { value: new THREE.Color(0xdff2fb) },
    },
    vertexShader: `varying float vy; void main(){ vy = normalize(position).y; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
    fragmentShader: `
      uniform vec3 top, mid, bottom; varying float vy;
      void main(){
        float h = clamp(vy * 0.5 + 0.5, 0.0, 1.0);
        vec3 c = h < 0.5 ? mix(bottom, mid, h * 2.0) : mix(mid, top, (h - 0.5) * 2.0);
        gl_FragColor = vec4(c, 1.0);
      }`,
  }),
);
SKY.renderOrder = -1000;
scene.add(SKY);

/** 바다는 지평선까지 — 섬 GLB 의 68×68 물판은 이 아래에 묻힌다 */
const OCEAN = (() => {
  const g = new THREE.PlaneGeometry(900, 900, 1, 1);
  g.rotateX(-Math.PI / 2);
  const m = new THREE.MeshToonMaterial({ color: 0x1f7fc4, gradientMap: (() => {
    const s = new Uint8Array([110, 165, 215, 255]);
    const t = new THREE.DataTexture(s, s.length, 1, THREE.RedFormat);
    t.minFilter = t.magFilter = THREE.NearestFilter; t.needsUpdate = true; return t;
  })() });
  const mesh = new THREE.Mesh(g, m);
  mesh.position.set(WORLD / 2, -0.06, WORLD / 2);
  mesh.renderOrder = -900;
  scene.add(mesh);
  return mesh;
})();

const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.5, 2000);
const CLOSE_UP = new URLSearchParams(location.search).has('stage');
const CX = WORLD / 2, CZ = WORLD / 2;
if (CLOSE_UP) {
  camera.position.set(CX - 5.5, 4.2, CZ + 7.5);   // 생존자 클로즈업
} else {
  camera.position.set(CX - 26, 34, CZ + 48);
}

const controls = new OrbitControls(camera, canvas);
controls.target.set(CX, CLOSE_UP ? 1.0 : 0, CZ);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
// 맵 고정 + 줌인아웃 (18-15)
controls.minDistance = 14;
controls.maxDistance = 84;
// CoC 규칙: 회전 불가. 드래그 = 팬(확대된 화면 안에서 이동), 휠 = 줌
controls.enableRotate = false;
controls.enablePan = true;
controls.screenSpacePanning = false;
controls.panSpeed = 0.7;
controls.zoomSpeed = 0.9;

// ---- 카메라 (18-15): 맵 고정 · 회전 불가 · 팬 + 줌만 ----
//  CoC 방식 — 각도는 고정. 확대된 화면 안에서 드래그로 이동만 한다.
const CAM_POLAR = Math.PI * 0.32;      // 고정 부감각
const CAM_AZIM = Math.PI * 0.22;

/** 팬은 섬 주변으로만 — 섬 밖으로 사라지지 않는다 */
const PAN_LIM = WORLD * 0.26;
function clampPan() {
  const t = controls.target;
  t.x = Math.max(CX - PAN_LIM, Math.min(CX + PAN_LIM, t.x));
  t.z = Math.max(CZ - PAN_LIM, Math.min(CZ + PAN_LIM, t.z));
  t.y = 0;
}

/** 월드좌표 → 팬 목표 (맵 경계 안으로 제한) */
function panTo(wx: number, wy: number, wz: number): THREE.Vector3 {
  const lim = PAN_LIM;
  return new THREE.Vector3(
    Math.max(CX - lim, Math.min(CX + lim, wx)),
    0,
    Math.max(CZ - lim, Math.min(CZ + lim, wz)),
  );
}
const heroPosX = () => (hero ? hero.position.x : 0);
const heroPosY = () => (hero ? hero.position.y + 0.85 : 0);
const heroPosZ = () => (hero ? hero.position.z : 0);
void heroPosX; void heroPosY; void heroPosZ;
let camTween: { from: THREE.Vector3; to: THREE.Vector3; t: number; target?: THREE.Vector3 } | null = null;

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
  // 섬 GLB 의 물판은 맵 크기의 정사각형이라 판떡이 된다 → 숨긴다(지평선 바다가 대신한다)
  if (groundMeshes.length > 1) {
    const water = groundMeshes.reduce((a, b) => (a.geometry.attributes.position.count <= b.geometry.attributes.position.count ? a : b));
    water.visible = false;
  }
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
  status.textContent = `로빈슨 · ${name === 'Walk' ? '이동' : name === 'Attack' ? '작업' : '대기'}`;
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

// ---------- 자원 노드 배치 (8종 3D 프롭) ----------
let propsRoot: THREE.Object3D | null = null;
const propTemplates = new Map<string, THREE.Object3D>();
const propNodes: { kind: string; x: number; z: number; y: number; obj: THREE.Object3D }[] = [];

const PROP_KINDS = ['tree', 'palm', 'berry', 'shell', 'rock', 'ore', 'tar', 'crystal',
  'b_campfire', 'b_hut', 'b_storage', 'b_wall', 'b_tower'];
gltf.load('/glb/props3d.glb', (g) => {
  propsRoot = g.scene;
  // 1) 툰 + 외곽선 (복제본이 함께 따라가도록 먼저)
  cocify([propsRoot], 0.012);
  // 2) 종류 노드를 템플릿으로 등록 (Blender join 이 여러 메쉬로 쪼개므로 노드 이름 기준)
  propsRoot.traverse((o) => {
    const n = (o.name || '').toLowerCase();
    if (PROP_KINDS.includes(n)) propTemplates.set(n, o);
  });
  propsRoot.visible = false;
  scene.add(propsRoot);
  spawnNodes();
  (window as unknown as { __props?: unknown }).__props = { propNodes, propTemplates };
}, undefined, (err) => { console.warn('[props]', err); });

let nodesSpawned = false;
function spawnNodes() {
  if (!propsRoot || !RULES || !groundMeshes.length) return;   // 아직 준비 안 됨 → 나중에 재시도
  nodesSpawned = true;
  const data = (RULES as unknown as { nodes: { kind: string; x: number; y: number }[] }).nodes;
  let i = 0;
  for (const n of data) {
    const tpl = propTemplates.get(n.kind);
    if (!tpl) continue;
    const wx = n.x / 32, wz = n.y / 32;              // 게임 좌표 → 월드
    const gy = groundAt(wx, wz);
    if (gy === null) continue;
    const inst = tpl.clone(true);
    inst.position.set(wx, gy - 0.04, wz);
    inst.rotation.y = (i * 2.399) % (Math.PI * 2);  // 황금각으로 자연스러운 회전
    const s = 0.88 + ((i * 37) % 24) / 100;          // 0.88 ~ 1.12 크기 흔들림
    inst.scale.setScalar(s);
    inst.visible = true;
    scene.add(inst);
    propNodes.push({ kind: n.kind, x: wx, z: wz, y: gy, obj: inst });
    i++;
  }
  const counts: Record<string, number> = {};
  for (const p of propNodes) counts[p.kind] = (counts[p.kind] ?? 0) + 1;
  (window as unknown as { __propCounts?: unknown }).__propCounts = counts;
  console.log('[props] placed', propNodes.length, JSON.stringify(counts));
}

// ---------- 인벤토리 + 채집 (게임의 심장) ----------
const ITEM = {
  wood: { icon: '🪵', name: '목재' },
  stone: { icon: '🪨', name: '돌' },
  food: { icon: '🍖', name: '먹이' },
  oil: { icon: '🛢️', name: '석유' },
  crystal: { icon: '💎', name: '수정' },
} as const;
type ItemKey = keyof typeof ITEM;

/** 노드 종류별 획득량 (게임 규칙과 동일하게) */
const YIELD: Record<string, ItemKey[]> = {
  tree: ['wood', 'wood', 'wood'], palm: ['wood', 'wood', 'food'], berry: ['food', 'food'],
  shell: ['food'], rock: ['stone', 'stone', 'stone'], ore: ['stone', 'stone', 'crystal'],
  tar: ['oil', 'oil'], crystal: ['crystal'],
};

const SAVE_KEY = 'robinson3d_v1';
const inv: Record<ItemKey, number> = { wood: 0, stone: 0, food: 0, oil: 0, crystal: 0 };
let harvested = 0;

function loadSave() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return;
    const s = JSON.parse(raw);
    for (const k of Object.keys(inv) as ItemKey[]) inv[k] = s.inv?.[k] ?? 0;
    harvested = s.harvested ?? 0;
  } catch { /* 처음 실행 */ }
}
function saveGame() {
  try { localStorage.setItem(SAVE_KEY, JSON.stringify({ inv, harvested, seed })); } catch { /* 무시 */ }
}
loadSave();

/** 무텍스트 규칙: 숫자만. 아이콘 + 개수 */
const HUD = document.getElementById('inv') as HTMLDivElement;
function paintHUD() {
  if (!HUD) return;
  const parts: string[] = [];
  for (const k of Object.keys(inv) as ItemKey[]) {
    if (inv[k] <= 0) continue;
    parts.push(`<span class="i">${ITEM[k].icon}</span><b>${inv[k]}</b>`);
  }
  HUD.innerHTML = parts.length ? parts.join('') : '<span class="empty">—</span>';
}
paintHUD();

// ============================================================
//  느린 재성장 (18-16): 자원은 많지 않고, 되살아나도 아주 천천히
// ============================================================

// ============================================================
//  느린 재성장 (18-16): 자원은 많지 않고, 되살아나도 아주 천천히
// ============================================================
const RESPAWN_T = 210;   // 3분 30초 — "많이 리스폰" 이 아니라 끝자락에서 하나씩
const respawnQ: { kind: string; x: number; z: number; y: number; t: number }[] = [];

function queueRespawn(n: (typeof propNodes)[number]) {
  respawnQ.push({ kind: n.kind, x: n.x, z: n.z, y: n.y, t: RESPAWN_T });
}

function updateRespawn(dt: number) {
  for (let i = respawnQ.length - 1; i >= 0; i--) {
    const r = respawnQ[i];
    r.t -= dt;
    if (r.t > 0) continue;
    respawnQ.splice(i, 1);
    const tpl = propTemplates.get(r.kind);
    if (!tpl) continue;
    const gy = groundAt(r.x, r.z);
    if (gy === null) continue;
    const inst = tpl.clone(true);
    inst.position.set(r.x, (gy ?? r.y) - 0.04, r.z);
    inst.rotation.y = (r.x * 3.1 + r.z * 1.7) % (Math.PI * 2);
    inst.scale.setScalar(0.62);          // 어린 풀로 돋아난다 → 2초에 걸쳐 자람
    inst.visible = true;
    inst.userData.grow = 0;
    scene.add(inst);
    propNodes.push({ kind: r.kind, x: r.x, z: r.z, y: gy, obj: inst });
  }
  // 성장 애니메이션
  for (const n of propNodes) {
    const g = n.obj.userData.grow;
    if (g === undefined) continue;
    const k = Math.min(1, g + dt / 2.5);
    n.obj.scale.setScalar(0.62 + 0.38 * k);
    n.obj.userData.grow = k;
    if (k >= 1) delete n.obj.userData.grow;
  }
}

function updateHarvest(dt: number) {
  updateRespawn(dt);
  // 사라지는 애니메이션
  for (let i = propNodes.length - 1; i >= 0; i--) {
    const n = propNodes[i];
    const ud = n.obj.userData;
    if (ud.dying !== undefined) {
      ud.dying += dt * 3.2;
      const s = Math.max(0.0001, 1 - ud.dying);
      n.obj.scale.setScalar(s);
      n.obj.rotation.y += dt * 6;
      if (s <= 0.02) {
        clearOrdered(n);
        queueRespawn(n);
        scene.remove(n.obj);
        propNodes.splice(i, 1);
      }
    }
  }
}
const ITEM_WALL = '';

// ============================================================
//  명령 시스템 — 플레이어는 "지시"하고 크루조가 알아서 간다 (CoC 방식)
// ============================================================
type Task = {
  id: number; type: 'harvest' | 'build';
  node?: (typeof propNodes)[number];
  x: number; z: number; kind?: string; def?: BuildDef;
};
const tasks: Task[] = [];
let taskSeq = 0;
const npc = { task: null as Task | null, state: 'idle' as 'idle' | 'walk' | 'work', timer: 0 };

/** 한 칸 이동 시도 (기존 이동 규칙 재사용) */
function tryStep(dx: number, dz: number, dist: number): boolean {
  const hero = window.__three ? (window as unknown as { __hero?: { hero: THREE.Object3D } }).__hero?.hero : null;
  if (!hero) return false;
  const SUB = 4;
  const ax = dx * (dist / SUB), az = dz * (dist / SUB);
  let moved = false;
  for (let s = 0; s < SUB; s++) {
    const g = groundAt(hero.position.x + ax, hero.position.z + az);
    if (g !== null && (!RULES || walkable(Math.floor(hero.position.x + ax), Math.floor(hero.position.z + az)))
        && Math.abs(hero.position.y - g) <= dist * 0.62) {
      hero.position.set(hero.position.x + ax, g, hero.position.z + az); moved = true; continue;
    }
    const gx = groundAt(hero.position.x + ax, hero.position.z);
    if (gx !== null && (!RULES || walkable(Math.floor(hero.position.x + ax), Math.floor(hero.position.z)))) {
      hero.position.x += ax; hero.position.y = gx; moved = true; continue;
    }
    const gz = groundAt(hero.position.x, hero.position.z + az);
    if (gz !== null && (!RULES || walkable(Math.floor(hero.position.x), Math.floor(hero.position.z + az)))) {
      hero.position.z += az; hero.position.y = gz; moved = true; continue;
    }
    break;
  }
  return moved;
}

function nearestIdleTask(): Task | null {
  const h = (window as unknown as { __hero?: { hero: THREE.Object3D } }).__hero?.hero;
  if (!h || !tasks.length) return null;
  let bi = 0, bd = Infinity;
  for (let i = 0; i < tasks.length; i++) {
    const t = tasks[i];
    const tx = t.node ? t.node.x : t.x, tz = t.node ? t.node.z : t.z;
    const d = (tx - h.position.x) ** 2 + (tz - h.position.z) ** 2;
    if (d < bd) { bd = d; bi = i; }
  }
  return tasks.splice(bi, 1)[0];
}

// ---- 채집 지시 마커 (노드 위에 뜨는 화살표) ----
const ORDER_GEO = new THREE.ConeGeometry(0.34, 0.62, 4);
const orderMarkers = new Map<THREE.Object3D, THREE.Mesh>();
function markOrdered(n: (typeof propNodes)[number], color = 0xffe27a) {
  if (orderMarkers.has(n.obj)) return;
  const m = new THREE.Mesh(ORDER_GEO, new THREE.MeshBasicMaterial({ color, transparent: true }));
  m.rotation.x = Math.PI;              // 아래를 향하게
  m.position.set(n.x, n.y + 2.4, n.z);
  scene.add(m);
  orderMarkers.set(n.obj, m);
}
function clearOrdered(n: (typeof propNodes)[number] | undefined) {
  if (!n) return;
  const m = orderMarkers.get(n.obj);
  if (m) { scene.remove(m); orderMarkers.delete(n.obj); }
}
function tickOrderMarkers(dt: number, t: number) {
  for (const [node, m] of orderMarkers) {
    m.position.y += 0;                       // 위치는 노드에 고정
    const k = 1 + Math.sin(t * 7) * 0.16;
    m.scale.set(k, k, k);
    m.rotation.y += dt * 3.4;
  }
}

function orderHarvest(n: (typeof propNodes)[number]) {
  if (tasks.some((t) => t.node === n)) return;
  tasks.push({ id: ++taskSeq, type: 'harvest', node: n, x: n.x, z: n.z });
  n.obj.userData.ordered = 1;
  markOrdered(n);
  status.textContent = '채집 지시!';
}

/** 크루조 AI: 대기 → 이동 → 작업 → 완료 */
function npcTick(dt: number) {
  const h = (window as unknown as { __hero?: { hero: THREE.Object3D } }).__hero?.hero;
  if (!h) return;
  if (!npc.task) {
    const t = nearestIdleTask();
    if (t) { npc.task = t; npc.state = 'walk'; npc.timer = 0; }
    else { npc.state = 'idle'; if (current === 'Walk') play('Idle'); return; }
  }
  const t = npc.task!;
  const tx = t.node ? t.node.x : t.x, tz = t.node ? t.node.z : t.z;
  const dx = tx - h.position.x, dz = tz - h.position.z;
  const d = Math.hypot(dx, dz);
  if (npc.state === 'walk') {
    if (d < 1.35) {
      npc.state = 'work';
      npc.timer = t.type === 'build' ? 2.4 : 1.5;
      play('Attack', false);
      status.textContent = t.type === 'build' ? '짓는 중…' : '채집 중…';
    } else {
      const sp = 3.4 * dt;
      if (tryStep(dx / d, dz / d, sp)) {
        const ang = Math.atan2(dx / d, dz / d) * (180 / Math.PI);
        h.rotation.y += (((ang + 180) - h.rotation.y + 540) % 360) - 180;
        if (current !== 'Walk') play('Walk');
      } else {
        // 갇힘 — 목표 쪽 한 칸을 옆으로 비켜본다
        tryStep(Math.cos(ang45(dx, dz)), Math.sin(ang45(dx, dz)), sp);
        tryStep(-Math.cos(ang45(dx, dz)), -Math.sin(ang45(dx, dz)), sp);
      }
    }
  } else if (npc.state === 'work') {
    const ang = Math.atan2(dx, dz) * (180 / Math.PI);
    h.rotation.y += (((ang + 180) - h.rotation.y + 540) % 360) - 180;
    npc.timer -= dt;
    if (npc.timer <= 0) finishTask(t);
  }
}
const ang45 = (dx: number, dz: number) => Math.atan2(dx, dz) + Math.PI / 2;

function finishTask(t: Task) {
  const h = (window as unknown as { __hero?: { hero: THREE.Object3D } }).__hero?.hero;
  clearOrdered(t.node);
  if (t.type === 'harvest' && t.node) {
    const list = YIELD[t.node.kind] ?? ['wood'];
    for (const k of list) inv[k] += 1;
    harvested += 1;
    t.node.obj.userData.dying = 0.001;
    status.textContent = `채집! (+${list.map((k) => ITEM[k].icon).join('')})`;
  } else if (t.type === 'build' && t.def) {
    const chk = buildCheck(t.x, t.z, t.def.size);
    if (chk.ok && canAfford(t.def.cost)) {
      const tpl = propTemplates.get(t.def.kind);
      if (tpl) {
        pay(t.def.cost);
        const inst = tpl.clone(true);
        inst.position.set(t.x, chk.y, t.z);
        inst.visible = true;
        scene.add(inst);
        built.push({ kind: t.def.kind, x: t.x, z: t.z, obj: inst });
        status.textContent = `${t.def.name} 완성!`;
      }
    } else {
      status.textContent = `건설 실패 — ${chk.ok ? '재료 부족' : chk.why}`;
    }
  }
  paintHUD();
  saveGame();
  npc.task = null;
  npc.state = 'idle';
  void h;
}

/** 지우개: 건설된 건물 회수 (50% 반환) */
function demolishAt(wx: number, wz: number) {
  for (let i = built.length - 1; i >= 0; i--) {
    const b = built[i];
    if (Math.abs(b.x - wx) < 1.2 && Math.abs(b.z - wz) < 1.2) {
      const def = BUILDS.find((x) => x.kind === b.kind);
      if (def) for (const k of Object.keys(def.cost) as ItemKey[]) inv[k] += Math.floor((def.cost[k] ?? 0) * 0.5);
      scene.remove(b.obj);
      built.splice(i, 1);
      saveGame(); paintHUD();
      status.textContent = '철거 (재료 50%)';
      return true;
    }
  }
  return false;
}

/** 클릭: 노드면 채집 지시 / 건물이면 철거 / 빈 땅이면(건설모드) 건설 지시 */
renderer.domElement.addEventListener('click', (ev) => {
  if (!hero) return;
  const rc = new THREE.Raycaster();
  const r = renderer.domElement.getBoundingClientRect();
  const mx = (ev.clientX - r.left) / r.width * 2 - 1;
  const my = -((ev.clientY - r.top) / r.height) * 2 + 1;
  rc.setFromCamera(new THREE.Vector2(mx, my), camera);
  const p = pointerToWorld(ev);
  // 바닥 좌표는 그대로 쓴다 — 타일 인덱스는 buildCheck/groundAt 내부에서 floor 처리
  const wx = p ? p[0] : 0, wz = p ? p[1] : 0;

  // 0) 건설 모드면 "지을 수 있는 빈땅" 이 최우선 — 나무가 클릭을 가로채지 못하게
  if (buildIdx >= 0) {
    const def = BUILDS[buildIdx];
    const chk = p ? buildCheck(wx, wz, def.size) : { ok: false, y: 0, why: '맵 밖' };
    if (chk.ok) {
      if (!canAfford(def.cost)) { status.textContent = '재료 부족'; return; }
      tasks.push({ id: ++taskSeq, type: 'build', x: wx, z: wz, kind: def.kind, def });
      status.textContent = `${def.name} 지시! (크루조가 이동합니다)`;
      paintHUD();
      return;
    }
    orderReason = chk.why;                 // 클릭이 실패하면 노드 → 철거 순으로 더 시도
  }

  // 1) 직접 레이캐스트 — 클릭이 정확히 meshes 를 때릴 때
  let hitNode: (typeof propNodes)[number] | null = null;
  for (const n of propNodes) {
    if (!n.obj.visible) continue;
    if (rc.intersectObject(n.obj, true).length) { hitNode = n; break; }
  }
  // 2) 폴백 — 얇은 나뭇잎은 빗나가기 쉽다. 커서 바로 아래 노드를 찾는다
  if (!hitNode) {
    let bestPx = 34 * 34;
    const v = new THREE.Vector3();
    for (const n of propNodes) {
      if (!n.obj.visible) continue;
      v.set(n.x, n.y + 0.7, n.z).project(camera);
      if (v.z > 1) continue;                                   // 카메라 뒤
      const px = (v.x * 0.5 + 0.5) * r.width - (ev.clientX - r.left);
      const py = (-v.y * 0.5 + 0.5) * r.height - (ev.clientY - r.top);
      const d2 = px * px + py * py;
      if (d2 < bestPx) { bestPx = d2; hitNode = n; }
    }
  }
  if (hitNode) { orderHarvest(hitNode); return; }

  // 3) 빈 땅 → 건설 지시 / 건물 → 철거
  if (!p) return;
  if (demolishAt(wx, wz)) return;
  if (buildIdx >= 0) {
    status.textContent = `여기론 못 지음 — ${orderReason || '안 됨'}`;
  }
});
let orderReason = '';

// ---------- 건설 (BUILD) ----------
interface BuildDef {
  kind: string; name: string; icon: string; cost: Partial<Record<ItemKey, number>>; size: number;
}
const BUILDS: BuildDef[] = [
  { kind: 'b_campfire', name: '모닥불', icon: '🔥', cost: { wood: 4, stone: 2 }, size: 1 },
  { kind: 'b_hut', name: '오두막', icon: '🛖', cost: { wood: 12, stone: 4 }, size: 2 },
  { kind: 'b_storage', name: '창고', icon: '📦', cost: { wood: 16, stone: 6 }, size: 2 },
  { kind: 'b_wall', name: '울타리', icon: '🧱', cost: { wood: 6, stone: 2 }, size: 1 },
  { kind: 'b_tower', name: '감시탑', icon: '🗼', cost: { wood: 20, stone: 14 }, size: 2 },
];
let buildIdx = -1;                       // -1 = 건설 모드 아님
const ghost = new THREE.Mesh(
  new THREE.BoxGeometry(1, 0.1, 1),
  new THREE.MeshBasicMaterial({ color: 0x7CFC9A, transparent: true, opacity: 0.45 }),
);
ghost.visible = false;
scene.add(ghost);
const built: { kind: string; x: number; z: number; obj: THREE.Object3D }[] = [];

function canAfford(c: Partial<Record<ItemKey, number>>) {
  for (const k of Object.keys(c) as ItemKey[]) if (inv[k] < (c[k] ?? 0)) return false;
  return true;
}
function pay(c: Partial<Record<ItemKey, number>>) {
  for (const k of Object.keys(c) as ItemKey[]) inv[k] -= c[k] ?? 0;
}

/** 건설 가능 여부: 평평 + 물 아님 + 기존 건물/노드와 겹치지 않음 */
function buildCheck(wx: number, wz: number, size: number): { ok: boolean; y: number; why: string } {
  const g = groundAt(wx, wz);
  if (g === null) return { ok: false, y: 0, why: '물' };
  if (RULES) {
    const tx = Math.floor(wx), tz = Math.floor(wz);
    const m = RULES.map;
    const half = Math.floor(size / 2);
    for (let dz = -half; dz <= half; dz++) {
      for (let dx = -half; dx <= half; dx++) {
        const x = tx + dx, z = tz + dz;
        if (x < 0 || z < 0 || x >= m || z >= m) return { ok: false, y: g, why: '맵 밖' };
        const i = z * m + x;
        if (RULES.steep[i]) return { ok: false, y: g, why: '절벽 위' };
        if (RULES.elev[i] < 0.05) return { ok: false, y: g, why: '물 위' };
      }
    }
  }
  // 노드/건물과 겹침
  for (const n of propNodes) {
    if (Math.abs(n.x - wx) < size * 0.7 && Math.abs(n.z - wz) < size * 0.7) {
      return { ok: false, y: g, why: '자리에 장애물' };
    }
  }
  for (const p of built) {
    if (Math.abs(p.x - wx) < size * 0.8 && Math.abs(p.z - wz) < size * 0.8) {
      return { ok: false, y: g, why: '이미 건물이 있음' };
    }
  }
  return { ok: true, y: g, why: '' };
}

/** 건설 메뉴 DOM (아이콘만 — 무텍스트 규칙) */
const BMENU = document.getElementById('bmenu') as HTMLDivElement;
function paintBuildMenu() {
  if (!BMENU) return;
  BMENU.innerHTML = BUILDS.map((b, i) => {
    const on = i === buildIdx;
    const afford = canAfford(b.cost);
    const cost = Object.entries(b.cost).map(([k, v]) => ITEM[k as ItemKey].icon + v).join('');
    return `<button class="bi${on ? ' on' : ''}${afford ? '' : ' poor'}" data-i="${i}">
      <span class="ic">${b.icon}</span><span class="cst">${cost}</span></button>`;
  }).join('');
}
BMENU?.addEventListener('click', (e) => {
  const btn = (e.target as HTMLElement).closest('button') as HTMLButtonElement | null;
  if (!btn) return;
  const i = Number(btn.dataset.i);
  buildIdx = buildIdx === i ? -1 : i;        // 다시 누르면 취소
  paintBuildMenu();
  ghost.visible = false;
  status.textContent = buildIdx < 0
    ? '건설 모드 해제'
    : `${BUILDS[i].name} 선택 — 맵을 눌러 건설 지시`;
});
function exitBuildMode() { buildIdx = -1; ghost.visible = false; paintBuildMenu(); }
paintBuildMenu();

/** Pointer = 지도 위 위치 계산 (건설 모드 미리보기) */
function pointerToWorld(ev: PointerEvent): [number, number] | null {
  const r = renderer.domElement.getBoundingClientRect();
  const nd = new THREE.Vector2(
    ((ev.clientX - r.left) / r.width) * 2 - 1,
    -((ev.clientY - r.top) / r.height) * 2 + 1,
  );
  const rc = new THREE.Raycaster();
  rc.setFromCamera(nd, camera);
  const hit = rc.intersectObjects(groundMeshes, false)[0];
  return hit ? [hit.point.x, hit.point.z] : null;
}
renderer.domElement.addEventListener('pointermove', (ev) => {
  if (buildIdx < 0) { ghost.visible = false; return; }
  const p = pointerToWorld(ev);
  if (!p) { ghost.visible = false; return; }
  const b = BUILDS[buildIdx];
  const tx = Math.floor(p[0]) + 0.5, tz = Math.floor(p[1]) + 0.5;
  const chk = buildCheck(tx, tz, b.size);
  const y = groundAt(tx, tz);
  ghost.visible = y !== null;
  ghost.position.set(tx, (y ?? 0) + 0.06, tz);
  ghost.scale.set(b.size, 1, b.size);
  (ghost.material as THREE.MeshBasicMaterial).color.setHex(chk.ok ? 0x7CFC9A : 0xFF5A5A);
  status.textContent = `건설: ${b.name} · ${chk.ok ? '가능' : chk.why}`;
});
// 건설 확정도 click 핸들러(명령 큐)가 담당 — 여기서는 미리보기만

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
  nodes: { kind: string; x: number; y: number }[];
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
        nodes: j.nodes ?? [],
        elev: dec(j.elev, Float32Array), steep: dec(j.steep, Uint8Array), ramp: dec(j.ramp, Uint8Array),
      };
      (window as unknown as { __rules?: IslandRules }).__rules = RULES;
      spawnNodes();                                  // 노드 배치(프롭 로드 대기 중이면 자동)
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
      + `${m ? ` · 산 ${m.R}타일` : ''} · 노드 클릭=채집 / 하단 메뉴=건설 / 휠=줌 / 드래그=이동`;
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
  if (!nodesSpawned) spawnNodes();      // 섬 로드 완료 후 노드 배치 재시도
  if (placed || !hero || !groundMeshes.length || !RULES) return;
  placeAtSpawn();
  if (grounded) placed = true;
}

function stepHero(dt: number) {
  if (!nodesSpawned) spawnNodes();
  if (!hero) return;
  if (!placed) { maybePlace(); return; }
  if (!grounded) {
    const y = groundAt(hero.position.x, hero.position.z);
    if (y !== null) { hero.position.y = y; grounded = true; cocify([hero], 0.013); }
    return;
  }
  // 18-17: 크루조는 직접 조종하지 않는다. 명령(task)만 따른다 → npcTick()
}

// ---------- 루프 ----------
function resize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}
window.addEventListener('resize', resize);

// 18-17: 키보드 조작 없음 — 클릭(지시) · 휠(줌) · 드래그(이동) 만 쓴다
window.addEventListener('keydown', (e) => {
  if (e.code === 'Escape') exitBuildMode();
});

let prev = performance.now();
let clock = 0;

/** 한 프레임 진행 — RAF 없이도手动으로 돌릴 수 있게 노출(테스트/백그라운드 탭용) */
export function tick(dt = 1 / 60) {
  clock += dt;
  stepHero(dt);
  npcTick(dt);
  updateHarvest(dt);
  tickOrderMarkers(dt, clock);
  if (camTween) {
    camTween.t = Math.min(1, camTween.t + dt * 2.2);
    const e = 1 - Math.pow(1 - camTween.t, 3);
    camera.position.lerpVectors(camTween.from, camTween.to, e);
    if (camTween.target) controls.target.lerp(camTween.target, e);
    if (camTween.t >= 1) camTween = null;
  }
  mixer.update(dt);
  controls.update();
  clampPan();
  renderer.render(scene, camera);
}

renderer.setAnimationLoop((t) => {
  const dt = Math.min(0.05, (t - prev) / 1000);
  prev = t;
  tick(dt);
});

// 디버그 훅
(window as unknown as { __three?: unknown }).__three = {
  scene, camera, renderer, controls, groundMeshes, groundAt, isGrounded: () => grounded, tick,
  THREE, get RULES() { return RULES; }, get hero() { return hero; }, propNodes, built, tasks,
  orderHarvest, buildCheck, BUILDS, respawnQ, get buildIdx() { return buildIdx; },
};