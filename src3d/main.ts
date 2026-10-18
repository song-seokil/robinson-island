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
camera.position.set(WORLD / 2 - 34, 46, WORLD / 2 + 62);

const controls = new OrbitControls(camera, canvas);
controls.target.set(WORLD / 2, 0, WORLD / 2);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.minDistance = 14;
controls.maxDistance = 190;
controls.maxPolarAngle = Math.PI * 0.49;      // 지면 아래로 못 내려감
controls.minPolarAngle = Math.PI * 0.08;
controls.enablePan = true;
controls.screenSpacePanning = false;

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
  });
  scene.add(root);
  status.textContent = `로빈슨의 섬 · 3D · 시드 ${seed} · ${WORLD}×${WORLD}타일`;
  (window as unknown as { __island?: THREE.Object3D }).__island = root;
}, undefined, (err) => {
  status.textContent = `섬 로드 실패: ${err}`;
});

// ---------- 루프 ----------
function resize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}
window.addEventListener('resize', resize);

renderer.setAnimationLoop(() => {
  controls.update();
  renderer.render(scene, camera);
});

// 디버그 훅
(window as unknown as { __three?: unknown }).__three = { scene, camera, renderer, controls };