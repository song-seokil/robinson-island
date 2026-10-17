import Phaser from 'phaser';
import { C } from '../core/config';

/**
 * 무에셋 그래픽 — 모든 스프라이트를 Canvas2D 로 코드에서 생성한다.
 * 나중에 진짜 픽셀아트/일러스트로 교체할 때는 이 파일만 갈아끼우면 된다.
 */

const hex = (n: number) => '#' + n.toString(16).padStart(6, '0');

function tex(scene: Phaser.Scene, key: string, w: number, h: number, draw: (c: CanvasRenderingContext2D) => void) {
  if (scene.textures.exists(key)) return;
  const t = scene.textures.createCanvas(key, w, h);
  if (!t) return;
  const ctx = t.getContext();
  draw(ctx);
  t.refresh();
}

function rr(c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  const rad = Math.min(r, w / 2, h / 2);
  c.beginPath();
  c.moveTo(x + rad, y);
  c.lineTo(x + w - rad, y);
  c.quadraticCurveTo(x + w, y, x + w, y + rad);
  c.lineTo(x + w, y + h - rad);
  c.quadraticCurveTo(x + w, y + h, x + w - rad, y + h);
  c.lineTo(x + rad, y + h);
  c.quadraticCurveTo(x, y + h, x, y + h - rad);
  c.lineTo(x, y + rad);
  c.quadraticCurveTo(x, y, x + rad, y);
  c.closePath();
}

function fillRR(c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number, color: string | CanvasGradient, alpha = 1) {
  c.save();
  c.globalAlpha = alpha;
  rr(c, x, y, w, h, r);
  c.fillStyle = color;
  c.fill();
  c.restore();
}

function dot(c: CanvasRenderingContext2D, x: number, y: number, r: number, color: string, alpha = 1) {
  c.save();
  c.globalAlpha = alpha;
  c.beginPath();
  c.arc(x, y, r, 0, Math.PI * 2);
  c.fillStyle = color;
  c.fill();
  c.restore();
}

function ell(c: CanvasRenderingContext2D, x: number, y: number, rx: number, ry: number, rot: number, color: string, alpha = 1) {
  c.save();
  c.globalAlpha = alpha;
  c.beginPath();
  c.ellipse(x, y, rx, ry, rot, 0, Math.PI * 2);
  c.fillStyle = color;
  c.fill();
  c.restore();
}

function poly(c: CanvasRenderingContext2D, pts: number[][], color: string, alpha = 1) {
  c.save();
  c.globalAlpha = alpha;
  c.beginPath();
  c.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) c.lineTo(pts[i][0], pts[i][1]);
  c.closePath();
  c.fillStyle = color;
  c.fill();
  c.restore();
}

function line(c: CanvasRenderingContext2D, x1: number, y1: number, x2: number, y2: number, w: number, color: string, alpha = 1) {
  c.save();
  c.globalAlpha = alpha;
  c.beginPath();
  c.moveTo(x1, y1);
  c.lineTo(x2, y2);
  c.lineWidth = w;
  c.strokeStyle = color;
  c.lineCap = 'round';
  c.stroke();
  c.restore();
}

/** 캐릭터 공통 뼈대 */
function humanoid(
  c: CanvasRenderingContext2D,
  o: { skin: string; cloth: string; cloth2: string; accent: string; hat?: 'straw' | 'bandana' | 'tricorn' | 'hair'; w?: number; h?: number; scale?: number }
) {
  const s = o.scale ?? 1;
  const W = o.w ?? 44, H = o.h ?? 60;
  const cx = W / 2;
  const legY = H - 14 * s;
  // 다리
  fillRR(c, cx - 9 * s, legY, 7 * s, 13 * s, 3 * s, hex(0x3b3f52));
  fillRR(c, cx + 2 * s, legY, 7 * s, 13 * s, 3 * s, hex(0x32364a));
  // 몸통
  fillRR(c, cx - 13 * s, H - 40 * s, 26 * s, 26 * s, 8 * s, o.cloth);
  // 조끼/장식
  fillRR(c, cx - 13 * s, H - 40 * s, 26 * s, 26 * s, 8 * s, o.cloth2, 0.85);
  fillRR(c, cx - 13 * s, H - 40 * s, 26 * s, 9 * s, 7 * s, o.accent, 0.55);
  // 팔
  fillRR(c, cx - 17 * s, H - 37 * s, 5 * s, 17 * s, 2.5 * s, o.cloth);
  fillRR(c, cx + 12 * s, H - 37 * s, 5 * s, 17 * s, 2.5 * s, o.cloth);
  // 손
  dot(c, cx - 14.5 * s, H - 20 * s, 3.2 * s, o.skin);
  dot(c, cx + 14.5 * s, H - 20 * s, 3.2 * s, o.skin);
  // 머리
  dot(c, cx, H - 50 * s, 10 * s, o.skin);
  // 눈
  dot(c, cx - 3.4 * s, H - 51 * s, 1.25 * s, '#241f2b');
  dot(c, cx + 3.4 * s, H - 51 * s, 1.25 * s, '#241f2b');
  // 모자/머리
  if (o.hat === 'straw') {
    ell(c, cx, H - 55 * s, 15 * s, 5 * s, 0, hex(0xd9b463));
    dot(c, cx, H - 59 * s, 8.5 * s, hex(0xe8c878));
    ell(c, cx, H - 60 * s, 8.5 * s, 3.5 * s, 0, hex(0xf2d894), 0.75);
    fillRR(c, cx - 9 * s, H - 57 * s, 18 * s, 3.4 * s, 1.6 * s, hex(0x8c5a3c));
  } else if (o.hat === 'bandana') {
    dot(c, cx, H - 56 * s, 10.5 * s, o.accent);
    fillRR(c, cx - 11 * s, H - 54 * s, 22 * s, 4 * s, 2 * s, hex(0xb43a3a), 0.9);
    line(c, cx + 8 * s, H - 54 * s, cx + 15 * s, H - 48 * s, 2 * s, o.accent);
  } else if (o.hat === 'tricorn') {
    dot(c, cx, H - 58 * s, 9 * s, hex(0x24242e));
    ell(c, cx, H - 57 * s, 17 * s, 4.5 * s, 0, hex(0x2b2b38));
    ell(c, cx, H - 60 * s, 9 * s, 6.5 * s, 0, hex(0x33333f));
    line(c, cx - 12 * s, H - 57 * s, cx + 12 * s, H - 57 * s, 1.5 * s, hex(0xd8b23c));
    dot(c, cx, H - 52 * s, 2 * s, hex(0xd8b23c));
  } else if (o.hat === 'hair') {
    ell(c, cx, H - 55 * s, 10.5 * s, 7.5 * s, 0, hex(0x232326));
    ell(c, cx, H - 52 * s, 10 * s, 6 * s, 0, o.skin);
  }
}

export function buildTextures(scene: Phaser.Scene) {
  // ===================== 지형 타일 =====================
  tex(scene, 't_water', 32, 32, (c) => {
    c.fillStyle = hex(C.water);
    c.fillRect(0, 0, 32, 32);
    for (let i = 0; i < 3; i++) {
      const x = Math.random() * 26 + 1, y = Math.random() * 30 + 1;
      line(c, x, y, x + 5, y, 1.6, hex(C.waterLight), 0.5);
    }
    dot(c, Math.random() * 32, Math.random() * 32, 1.4, hex(C.waterDeep), 0.5);
  });
  tex(scene, 't_water_deep', 32, 32, (c) => {
    c.fillStyle = hex(C.waterDeep);
    c.fillRect(0, 0, 32, 32);
    line(c, 4, 10, 12, 10, 1.4, hex(C.water), 0.4);
    line(c, 18, 24, 27, 24, 1.4, hex(C.water), 0.3);
  });
  tex(scene, 't_sand', 32, 32, (c) => {
    c.fillStyle = hex(C.sand);
    c.fillRect(0, 0, 32, 32);
    for (let i = 0; i < 9; i++) dot(c, Math.random() * 32, Math.random() * 32, Math.random() * 1.1 + 0.4, i % 3 === 0 ? hex(C.sandDark) : hex(C.sandLight), 0.55);
  });
  tex(scene, 't_sand_wet', 32, 32, (c) => {
    c.fillStyle = hex(C.sandDark);
    c.fillRect(0, 0, 32, 32);
    for (let i = 0; i < 6; i++) dot(c, Math.random() * 32, Math.random() * 32, Math.random() * 1.3 + 0.5, hex(C.sand), 0.5);
  });
  tex(scene, 't_grass', 32, 32, (c) => {
    c.fillStyle = hex(C.grass);
    c.fillRect(0, 0, 32, 32);
    for (let i = 0; i < 7; i++) {
      const x = Math.random() * 32, y = Math.random() * 32;
      line(c, x, y, x + (Math.random() * 2 - 1) * 2, y - Math.random() * 4 - 1, 1.2, i % 2 ? hex(C.grassDark) : hex(C.grassLight), 0.6);
    }
  });
  tex(scene, 't_jungle', 32, 32, (c) => {
    c.fillStyle = hex(C.jungle);
    c.fillRect(0, 0, 32, 32);
    for (let i = 0; i < 8; i++) dot(c, Math.random() * 32, Math.random() * 32, Math.random() * 1.6 + 0.5, i % 2 ? hex(C.grassDark) : hex(C.leaf), 0.45);
  });
  tex(scene, 't_rock', 32, 32, (c) => {
    c.fillStyle = hex(C.rock);
    c.fillRect(0, 0, 32, 32);
    for (let i = 0; i < 4; i++) {
      const x = Math.random() * 32, y = Math.random() * 32;
      line(c, x, y, x + Math.random() * 8 - 4, y + Math.random() * 6 - 2, 1.2, hex(C.rockDark), 0.5);
    }
    dot(c, Math.random() * 32, Math.random() * 32, 2.2, hex(0xa9aeb4), 0.4);
  });

  // ===================== 장식 =====================
  tex(scene, 'd_tuft', 16, 12, (c) => {
    for (let i = 0; i < 4; i++) {
      const x = 3 + i * 3.2;
      line(c, x, 11, x + (i % 2 ? 1.5 : -1.5), 3, 1.4, i % 2 ? hex(C.grassLight) : hex(C.grassDark), 0.75);
    }
  });
  tex(scene, 'd_pebble', 12, 10, (c) => {
    dot(c, 5, 6, 3, hex(C.rockDark), 0.85);
    dot(c, 8.4, 7, 2, hex(C.rock), 0.8);
  });
  tex(scene, 'd_shell', 10, 10, (c) => {
    dot(c, 5, 5, 3.4, hex(0xf4efe2), 0.9);
    line(c, 3, 6, 7, 6, 1, hex(0xd0c4ab), 0.9);
    line(c, 5, 3, 5, 8, 1, hex(0xd0c4ab), 0.7);
  });

  // ===================== 자원 노드 =====================
  tex(scene, 'n_tree', 72, 92, (c) => {
    // 줄기 — 왼쪽 밝은 면 + 뿌리
    fillRR(c, 30, 48, 12, 42, 4, hex(0x3f2412));
    fillRR(c, 30, 48, 6, 42, 3, hex(C.bark));
    line(c, 38, 54, 38, 88, 1.4, hex(0x2c1a0c), 0.6);
    ell(c, 28, 90, 8, 3, 0, hex(0x33200f), 0.9);
    ell(c, 43, 90, 7, 3, 0, hex(0x33200f), 0.85);
    // 수관 — 실루엣 → 본체 → 위쪽 하이라이트
    dot(c, 36, 34, 27, hex(0x1c4527));
    dot(c, 19, 46, 16, hex(0x1c4527));
    dot(c, 53, 46, 16, hex(0x1c4527));
    dot(c, 36, 33, 24, hex(0x2f7a41));
    dot(c, 21, 45, 14, hex(0x2a6f3b));
    dot(c, 51, 45, 14, hex(0x2a6f3b));
    dot(c, 30, 25, 17, hex(0x3a8f4c));
    dot(c, 25, 20, 10, hex(0x4fb066));
    dot(c, 21, 16, 5, hex(0x6fcf83), 0.9);
    // 잎 결 (아래쪽 그늘)
    dot(c, 45, 34, 8, hex(0x275f33), 0.55);
    dot(c, 33, 45, 7, hex(0x275f33), 0.5);
    // 열매
    dot(c, 46, 40, 2.8, hex(0xe05a45));
    dot(c, 45.1, 39.1, 1.1, '#ffd8cd', 0.85);
    dot(c, 34, 47, 2.4, hex(0xd8452f), 0.95);
    dot(c, 33.2, 46.2, 0.9, '#ffc9bd', 0.8);
  });
  tex(scene, 'n_palm', 76, 96, (c) => {
    // 줄기 — 곡선 + 마디
    c.save();
    c.beginPath();
    c.moveTo(34, 94);
    c.quadraticCurveTo(27, 58, 37, 24);
    c.lineWidth = 10.5;
    c.lineCap = 'round';
    c.strokeStyle = hex(0x3f2412);
    c.stroke();
    c.beginPath();
    c.moveTo(31.5, 94);
    c.quadraticCurveTo(25, 58, 35, 24);
    c.lineWidth = 6;
    c.strokeStyle = hex(0x6b4526);
    c.stroke();
    c.restore();
    for (let i = 0; i < 4; i++) line(c, 28 - i * 0.5, 84 - i * 18, 36 - i * 0.5, 82 - i * 18, 1.6, hex(0x33200f), 0.5);
    // 잎 — 어두운 밑면 위에 밝은 윗면
    const fx = 38, fy = 22;
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * Math.PI * 2 + 0.35;
      line(c, fx, fy, fx + Math.cos(a) * 24, fy + Math.sin(a) * 15 + 6, 7.5, hex(0x1e5230), 0.95);
    }
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * Math.PI * 2 + 0.35;
      const ex = fx + Math.cos(a) * 22, ey = fy + Math.sin(a) * 13 + 6;
      line(c, fx, fy - 1, ex, ey - 1, 4.6, i % 2 ? hex(0x3f9b52) : hex(0x2f7a41), 0.95);
      line(c, fx, fy - 1, ex, ey - 1, 2.2, hex(0x57b86a), 0.7);
    }
    // 코코넛
    dot(c, 31, 31, 4.2, hex(0x8a6031));
    dot(c, 29.8, 29.8, 1.6, hex(0xb98a52), 0.85);
    dot(c, 45, 33, 3.8, hex(0x7d5629));
    dot(c, 44, 32, 1.4, hex(0xa87b45), 0.8);
    dot(c, 26, 30, 1.6, hex(0x6b4a26), 0.9);
  });
  tex(scene, 'n_rock', 60, 52, (c) => {
    // 실루엣 → 몸통 → 빛 받는 윗면 → 그늘 면
    poly(c, [[4, 46], [12, 20], [30, 8], [50, 22], [56, 46]], hex(0x4a4e54));
    poly(c, [[9, 46], [16, 22], [31, 12], [46, 24], [51, 46]], hex(0x8d9198));
    poly(c, [[18, 24], [31, 14], [42, 24], [31, 30]], hex(0xaeb4bb), 0.95);
    poly(c, [[31, 30], [42, 24], [46, 38], [34, 44]], hex(0x6d7178), 0.85);
    poly(c, [[9, 46], [16, 22], [20, 34], [14, 46]], hex(0x7b8087), 0.7);
    // 이끼
    dot(c, 14, 42, 3, hex(0x4a7a45), 0.55);
    dot(c, 44, 42, 2.4, hex(0x4a7a45), 0.45);
  });
  // 광맥 — 바위에 수정 가루가 박혀 있다
  tex(scene, 'n_ore', 60, 52, (c) => {
    poly(c, [[4, 46], [12, 20], [30, 8], [50, 22], [56, 46]], hex(0x464a52));
    poly(c, [[9, 46], [16, 22], [31, 12], [46, 24], [51, 46]], hex(0x83878e));
    poly(c, [[18, 24], [31, 14], [42, 24], [31, 30]], hex(0xa0a6ad), 0.9);
    // 수정맥
    poly(c, [[16, 42], [24, 26], [30, 44]], hex(C.crystalDeep));
    poly(c, [[22, 44], [32, 20], [40, 44]], hex(C.crystal));
    poly(c, [[36, 44], [44, 30], [50, 44]], hex(C.crystalDeep));
    poly(c, [[26, 42], [32, 26], [36, 42]], hex(0xcdf6ff), 0.75);
    dot(c, 32, 26, 3.2, '#ffffff', 0.85);
    dot(c, 46, 36, 1.8, '#d8f8ff', 0.8);
  });
  // 타르 웅덩이 (석유)
  tex(scene, 'n_tar', 64, 44, (c) => {
    ell(c, 32, 27, 29, 17, 0, hex(0x14141a));
    ell(c, 32, 26, 27, 15, 0, hex(0x2b2b32));
    ell(c, 32, 25, 24, 13, 0, hex(C.oil));
    ell(c, 25, 21, 10, 4.6, -0.25, hex(C.oilSheen), 0.5);
    ell(c, 38, 30, 7, 3, 0.3, hex(0x8a8ab0), 0.25);
    dot(c, 43, 29, 3, hex(0x6a6a86), 0.55);
    dot(c, 20, 32, 2.2, hex(0x6a6a86), 0.45);
    for (let i = 0; i < 5; i++) dot(c, 12 + i * 10, 17 + (i % 2) * 9, 1.7, hex(0x8a8ab0), 0.3);
  });
  // 수정 결정 (빛나는 덩어리)
  tex(scene, 'n_crystal', 56, 62, (c) => {
    poly(c, [[10, 58], [18, 26], [26, 58]], hex(C.crystalDeep));
    poly(c, [[20, 58], [30, 10], [40, 58]], hex(C.crystal));
    poly(c, [[34, 58], [44, 30], [52, 58]], hex(C.crystalDeep));
    poly(c, [[22, 56], [30, 16], [36, 56]], hex(0xbdf6ff), 0.55);
    dot(c, 30, 20, 4, hex(0xffffff), 0.75);
    ell(c, 31, 58, 22, 4, 0, hex(0x1a4a5c), 0.55);
  });
  // 산 — 고원 위에 세우는 입체 봉우리 (둥근 바위 덩어리 · 왼쪽 위 빛)
  tex(scene, 'd_mount', 136, 104, (c) => {
    // 실루엣
    c.save();
    c.beginPath();
    c.moveTo(2, 98);
    c.quadraticCurveTo(10, 66, 24, 46);
    c.quadraticCurveTo(34, 20, 48, 18);
    c.quadraticCurveTo(58, 4, 72, 20);
    c.quadraticCurveTo(88, 6, 102, 34);
    c.quadraticCurveTo(118, 58, 134, 98);
    c.closePath();
    c.fillStyle = hex(0x413b31);
    c.fill();
    c.restore();
    // 몸통
    c.save();
    c.beginPath();
    c.moveTo(10, 98);
    c.quadraticCurveTo(18, 68, 30, 50);
    c.quadraticCurveTo(40, 26, 50, 24);
    c.quadraticCurveTo(60, 12, 72, 26);
    c.quadraticCurveTo(86, 14, 98, 40);
    c.quadraticCurveTo(112, 62, 126, 98);
    c.closePath();
    c.fillStyle = hex(0x8a8172);
    c.fill();
    c.restore();
    // 빛 받는 면 (왼쪽 위)
    poly(c, [[24, 98], [34, 54], [48, 28], [58, 20], [66, 40], [52, 62], [44, 98]], hex(0xa49a88), 0.95);
    poly(c, [[72, 30], [84, 22], [94, 44], [82, 56]], hex(0x9b9180), 0.9);
    // 그늘 면 (오른쪽 아래)
    poly(c, [[58, 20], [72, 26], [70, 46], [60, 52]], hex(0x5c564a), 0.8);
    poly(c, [[84, 22], [102, 34], [112, 62], [96, 74], [86, 44]], hex(0x635c4f), 0.8);
    // 바위 결 (세로 금)
    for (let i = 0; i < 11; i++) {
      const x = 26 + i * 9;
      line(c, x, 94, x - 2 + (i % 3) * 2, 44 + (i % 5) * 9, 1.4, hex(0x554e42), 0.35);
    }
    // 능선 하이라이트
    line(c, 34, 50, 50, 22, 2.6, hex(0xcdc4b0), 0.7);
    line(c, 76, 26, 88, 34, 2.0, hex(0xc2b9a6), 0.55);
    // 바닥 자갈 + 그림자 띠 + 풀
    ell(c, 68, 96, 60, 8, 0, hex(0x35302a), 0.4);
    dot(c, 26, 96, 4.6, hex(0x6e6656), 0.9);
    dot(c, 40, 98, 3.4, hex(0x7d7464), 0.85);
    dot(c, 112, 97, 5, hex(0x6e6656), 0.85);
    dot(c, 24, 94, 4.4, hex(0x3f8a4c), 0.85);
    dot(c, 108, 94, 5, hex(0x37804a), 0.8);
    dot(c, 48, 96, 3.6, hex(0x459152), 0.75);
  });
  tex(scene, 'n_bush', 56, 46, (c) => {
    dot(c, 16, 32, 13, hex(0x2c6b3c));
    dot(c, 40, 32, 13, hex(0x2c6b3c));
    dot(c, 28, 24, 15, hex(0x357e46));
    dot(c, 22, 20, 8, hex(0x429651), 0.9);
    dot(c, 36, 38, 6, hex(0x255c33), 0.7);
  });
  tex(scene, 'n_berry', 56, 46, (c) => {
    dot(c, 16, 32, 13, hex(0x2c6b3c));
    dot(c, 40, 32, 13, hex(0x2c6b3c));
    dot(c, 28, 24, 15, hex(0x357e46));
    for (let i = 0; i < 6; i++) dot(c, 12 + Math.random() * 32, 20 + Math.random() * 18, 3.1, hex(0xd6456b));
    dot(c, 22, 26, 2.2, hex(0xf07a9c), 0.9);
  });

  // ===================== 캐릭터 =====================
  tex(scene, 'player', 44, 60, (c) => {
    humanoid(c, { skin: hex(0xe8b48c), cloth: hex(0x3f74a8), cloth2: hex(0x2f5885), accent: hex(0xd9d3c4), hat: 'straw' });
  });
  tex(scene, 'u_friday', 44, 60, (c) => {
    humanoid(c, { skin: hex(0x8d5a3b), cloth: hex(0x3f8a52), cloth2: hex(0x2f6b3f), accent: hex(0xd8c07a), hat: 'hair' });
    // 창
    line(c, 34, 46, 40, 16, 2.4, hex(0x8a5a33));
    poly(c, [[38, 18], [43, 12], [41, 22]], hex(0xc9ced4));
  });
  tex(scene, 'u_sword', 44, 60, (c) => {
    humanoid(c, { skin: hex(0xd9a06e), cloth: hex(0x5a4552), cloth2: hex(0x3c2f3a), accent: hex(0xb43a3a), hat: 'bandana' });
    line(c, 33, 44, 36, 22, 3.2, hex(0xc9ced4));
    line(c, 30, 44, 39, 42, 2.4, hex(0x8a6a3a));
  });
  tex(scene, 'u_archer', 44, 60, (c) => {
    humanoid(c, { skin: hex(0xcf9a66), cloth: hex(0x6b5a3f), cloth2: hex(0x4a3e2b), accent: hex(0xd07a2a), hat: 'bandana' });
    c.save();
    c.beginPath();
    c.arc(35, 36, 12, -1.15, 1.15);
    c.lineWidth = 2.4;
    c.strokeStyle = hex(0x8a5a33);
    c.stroke();
    c.restore();
    line(c, 30, 36, 42, 36, 1.6, hex(0xd9d3c4));
  });
  tex(scene, 'u_bomber', 44, 60, (c) => {
    humanoid(c, { skin: hex(0xbf8a5a), cloth: hex(0x54565e), cloth2: hex(0x3a3c44), accent: hex(0x2a2a30), hat: 'bandana' });
    dot(c, 36, 42, 7, hex(0x1f1f26));
    dot(c, 33.5, 39.5, 2.2, hex(0x6a6a78), 0.9);
    line(c, 38, 34, 42, 28, 1.6, hex(0x8a6a3a));
    dot(c, 43, 27, 2.2, hex(0xffb03a));
  });
  tex(scene, 'u_boss', 58, 76, (c) => {
    humanoid(c, { skin: hex(0xd0a070), cloth: hex(0x8f2f2f), cloth2: hex(0x6d1f1f), accent: hex(0xd8b23c), hat: 'tricorn', w: 58, h: 76, scale: 1.18 });
    line(c, 8, 52, 6, 26, 3.4, hex(0xc9ced4));
    line(c, 50, 52, 52, 26, 3.4, hex(0xc9ced4));
    dot(c, 44, 30, 2.6, hex(0x8f2f2f));
  });
  tex(scene, 'u_boar', 54, 42, (c) => {
    ell(c, 27, 24, 20, 13, 0, hex(0x6b4a33));
    ell(c, 27, 21, 20, 11, 0, hex(0x7d5a3f));
    dot(c, 44, 22, 9, hex(0x6b4a33));
    ell(c, 50, 25, 5, 4, 0, hex(0x8d6a4f));
    poly(c, [[44, 28], [49, 33], [45, 32]], hex(0xf0ead8));
    dot(c, 41, 20, 1.7, '#241f2b');
    line(c, 8, 30, 6, 36, 3, hex(0x4f3524));
    line(c, 18, 32, 17, 39, 3, hex(0x4f3524));
    line(c, 36, 32, 37, 39, 3, hex(0x4f3524));
    line(c, 46, 32, 47, 39, 3, hex(0x4f3524));
  });

  // ===================== 건물 =====================
  tex(scene, 'b_wall', 38, 46, (c) => {
    for (let i = 0; i < 3; i++) {
      const x = 3 + i * 12;
      fillRR(c, x, 12, 10, 32, 3, i === 1 ? hex(0x9a6a3f) : hex(C.bark));
      poly(c, [[x, 13], [x + 5, 3], [x + 10, 13]], hex(0xb08a5a));
    }
    line(c, 2, 24, 36, 22, 2, hex(0x4a3520), 0.8);
    line(c, 2, 38, 36, 37, 2, hex(0x4a3520), 0.8);
  });
  tex(scene, 'b_tower', 56, 84, (c) => {
    poly(c, [[10, 84], [18, 40], [38, 40], [46, 84]], hex(C.rockDark));
    poly(c, [[13, 84], [21, 42], [35, 42], [43, 84]], hex(C.rock));
    for (let i = 0; i < 4; i++) line(c, 16 + i * 8, 80, 20 + i * 8, 46, 1.4, hex(0x60656b), 0.5);
    fillRR(c, 8, 32, 40, 10, 3, hex(0x8a5a33));
    poly(c, [[12, 32], [44, 32], [38, 12], [18, 12]], hex(0x6b4526));
    poly(c, [[18, 12], [38, 12], [34, 4], [22, 4]], hex(0x53341d));
    line(c, 28, 4, 28, -2, 2, hex(0x4a3520), 1);
    dot(c, 28, 3, 3, hex(0xd8b23c));
  });
  tex(scene, 'b_campfire', 46, 42, (c) => {
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * Math.PI * 2;
      dot(c, 23 + Math.cos(a) * 16, 30 + Math.sin(a) * 10, 5.4, i % 2 ? hex(0x8b8f95) : hex(0x777c82));
    }
    line(c, 12, 34, 34, 26, 5, hex(C.bark));
    line(c, 34, 34, 12, 26, 5, hex(0x6b4526));
  });
  tex(scene, 'b_spikes', 46, 32, (c) => {
    ell(c, 23, 18, 20, 11, 0, hex(0x241f26));
    ell(c, 23, 17, 15, 8, 0, hex(0x14100f));
    for (let i = 0; i < 4; i++) {
      poly(c, [[9 + i * 9, 20], [13 + i * 9, 5], [17 + i * 9, 20]], i % 2 ? hex(0xa8aeb4) : hex(0x8b9096));
    }
  });
  tex(scene, 'b_raft', 80, 62, (c) => {
    for (let i = 0; i < 5; i++) {
      fillRR(c, 8 + i * 13, 14, 11, 40, 5, i % 2 ? hex(0x9a6a3f) : hex(0x8a5a33));
      dot(c, 13.5 + i * 13, 16, 2.2, hex(0xb08a5a), 0.8);
    }
    line(c, 6, 26, 74, 24, 2.4, hex(0x4a3520), 0.85);
    line(c, 6, 42, 74, 41, 2.4, hex(0x4a3520), 0.85);
    line(c, 40, 16, 40, 2, 3, hex(0x8a5a33));
    poly(c, [[41, 4], [58, 10], [41, 16]], hex(0xd9d3c4));
  });
  // 약탈 대상: 보물 상자
  tex(scene, 'b_chest', 52, 46, (c) => {
    fillRR(c, 6, 22, 40, 20, 3, hex(0x8a5a33));
    fillRR(c, 6, 12, 40, 13, 8, hex(0x9a6a3f));
    line(c, 6, 25, 46, 25, 2, hex(0x4a3520), 0.9);
    fillRR(c, 22, 12, 8, 30, 2, hex(0xd8b23c));
    dot(c, 26, 26, 3.4, hex(0xffe08a));
    for (let i = 0; i < 4; i++) dot(c, 10 + i * 11, 40, 1.8, hex(0x5d3b21), 0.7);
  });
  // 약탈 대상: 오두막
  tex(scene, 'b_hut', 60, 70, (c) => {
    fillRR(c, 12, 40, 36, 28, 3, hex(0xb08a5a));
    line(c, 12, 48, 48, 48, 2, hex(0x8a6a3f), 0.8);
    line(c, 12, 58, 48, 58, 2, hex(0x8a6a3f), 0.8);
    fillRR(c, 24, 50, 12, 18, 2, hex(0x5d3b21));
    poly(c, [[6, 40], [54, 40], [30, 6]], hex(0x9a7a3f));
    poly(c, [[14, 38], [46, 38], [30, 14]], hex(0xb08f52));
    for (let i = 0; i < 5; i++) line(c, 12 + i * 8, 38, 30, 12 + i * 2, 1.2, hex(0x8a7038), 0.45);
    line(c, 30, 6, 30, 0, 2, hex(0x4a3520));
  });

  // ===================== 무기(장비 표시) =====================
  tex(scene, 'w_spear', 12, 58, (c) => {
    line(c, 6, 56, 6, 12, 3, hex(0x8a5a33));
    poly(c, [[2.5, 13], [9.5, 13], [6, 1]], hex(0xc9ced4));
    line(c, 3, 16, 9, 16, 1.6, hex(0x6b4526), 0.9);
  });
  tex(scene, 'w_bow', 22, 46, (c) => {
    c.save();
    c.beginPath();
    c.arc(20, 23, 19, 1.72, 4.56);
    c.lineWidth = 3;
    c.strokeStyle = hex(0x8a5a33);
    c.lineCap = 'round';
    c.stroke();
    c.restore();
    line(c, 2.6, 6, 2.6, 40, 1.2, hex(0xe8e2d0), 0.9);
    line(c, 2.6, 23, 20, 23, 1.6, hex(0xd9d3c4), 0.9);
    poly(c, [[20, 21], [28, 23], [20, 25]], hex(0xc9ced4));
  });

  // ===================== 이펙트 =====================
  tex(scene, 'fx_flame', 30, 38, (c) => {
    const grad = c.createLinearGradient(0, 38, 0, 0);
    grad.addColorStop(0, 'rgba(255,120,20,0.95)');
    grad.addColorStop(0.5, 'rgba(255,190,40,0.95)');
    grad.addColorStop(1, 'rgba(255,240,180,0.9)');
    c.fillStyle = grad;
    c.beginPath();
    c.moveTo(15, 2);
    c.quadraticCurveTo(30, 16, 22, 28);
    c.quadraticCurveTo(18, 36, 15, 36);
    c.quadraticCurveTo(12, 36, 8, 28);
    c.quadraticCurveTo(0, 16, 15, 2);
    c.fill();
    dot(c, 15, 26, 5, 'rgba(255,255,210,0.85)');
  });
  tex(scene, 'fx_arrow', 28, 8, (c) => {
    line(c, 3, 4, 20, 4, 1.8, hex(0x8a5a33));
    poly(c, [[20, 1], [27, 4], [20, 7]], hex(0xc9ced4));
    poly(c, [[3, 1], [8, 4], [3, 7]], hex(0xd9534f));
  });
  tex(scene, 'fx_bomb', 22, 22, (c) => {
    dot(c, 11, 13, 8, hex(0x1f1f26));
    dot(c, 8.4, 10.4, 2.4, hex(0x6a6a78), 0.9);
    line(c, 14, 6, 18, 2, 1.6, hex(0x8a6a3a));
    dot(c, 19, 1.6, 2.2, hex(0xffb03a));
  });
  tex(scene, 'fx_slash', 64, 64, (c) => {
    for (let i = 0; i < 3; i++) {
      c.save();
      c.beginPath();
      c.arc(32, 36, 24 - i * 3, -1.5, 0.7);
      c.lineWidth = 9 - i * 2.6;
      c.lineCap = 'round';
      c.strokeStyle = i === 0 ? 'rgba(255,255,255,0.30)' : 'rgba(255,255,255,0.75)';
      c.stroke();
      c.restore();
    }
  });
  tex(scene, 'fx_spark', 10, 10, (c) => {
    const g2 = c.createRadialGradient(5, 5, 0, 5, 5, 5);
    g2.addColorStop(0, 'rgba(255,255,255,1)');
    g2.addColorStop(1, 'rgba(255,255,255,0)');
    c.fillStyle = g2;
    c.fillRect(0, 0, 10, 10);
  });
  tex(scene, 'fx_smoke', 24, 24, (c) => {
    const g2 = c.createRadialGradient(12, 12, 1, 12, 12, 12);
    g2.addColorStop(0, 'rgba(220,220,225,0.75)');
    g2.addColorStop(1, 'rgba(200,200,210,0)');
    c.fillStyle = g2;
    c.fillRect(0, 0, 24, 24);
  });
  tex(scene, 'fx_ring', 80, 80, (c) => {
    for (let i = 0; i < 3; i++) {
      c.save();
      c.beginPath();
      c.arc(40, 40, 34 - i * 5, 0, Math.PI * 2);
      c.lineWidth = 5 - i * 1.2;
      c.strokeStyle = i === 0 ? 'rgba(255,255,255,0.25)' : 'rgba(255,255,255,0.8)';
      c.stroke();
      c.restore();
    }
  });
  tex(scene, 'fx_coin', 18, 18, (c) => {
    dot(c, 9, 9, 8, hex(0xd8a520));
    dot(c, 9, 9, 6.4, hex(C.gold));
    dot(c, 6.6, 6.6, 2, 'rgba(255,255,255,0.8)');
  });
  tex(scene, 'fx_shadow', 44, 22, (c) => {
    const g2 = c.createRadialGradient(22, 11, 1, 22, 11, 20);
    g2.addColorStop(0, 'rgba(0,0,0,0.40)');
    g2.addColorStop(1, 'rgba(0,0,0,0)');
    c.fillStyle = g2;
    c.fillRect(0, 0, 44, 22);
  });
  tex(scene, 'fx_waves', 96, 96, (c) => {
    for (let i = 0; i < 10; i++) {
      const x = (i * 37) % 90, y = (i * 53) % 90;
      line(c, x, y, x + 9, y, 1.6, 'rgba(255,255,255,0.5)', 0.28);
    }
  });
  // 해안 파도 — 물가에서 반짝이는 물결
  tex(scene, 'fx_wave', 44, 18, (c) => {
    for (let i = 0; i < 3; i++) {
      c.save();
      c.beginPath();
      c.moveTo(6 + i * 5, 11 + i * 2.6);
      c.quadraticCurveTo(22, -3 + i * 5, 38 - i * 5, 11 + i * 2.6);
      c.lineWidth = 2.2 - i * 0.5;
      c.lineCap = 'round';
      c.strokeStyle = 'rgba(255,255,255,' + (0.85 - i * 0.24).toFixed(2) + ')';
      c.stroke();
      c.restore();
    }
  });
  // 입자 질감 — 바닥이 밋밋하지 않게 하는 명/암 점
  tex(scene, 'grain_a', 128, 128, (c) => {
    for (let i = 0; i < 460; i++) dot(c, Math.random() * 128, Math.random() * 128, Math.random() * 1.2 + 0.3, '#000000', Math.random() * 0.5 + 0.15);
  });
  tex(scene, 'grain_b', 128, 128, (c) => {
    for (let i = 0; i < 380; i++) dot(c, Math.random() * 128, Math.random() * 128, Math.random() * 1.1 + 0.3, '#ffffff', Math.random() * 0.4 + 0.12);
  });
  tex(scene, 'fx_vignette', 320, 180, (c) => {
    const g2 = c.createRadialGradient(160, 90, 40, 160, 90, 200);
    g2.addColorStop(0, 'rgba(0,0,0,0)');
    g2.addColorStop(0.65, 'rgba(0,0,0,0.22)');
    g2.addColorStop(1, 'rgba(0,0,0,0.72)');
    c.fillStyle = g2;
    c.fillRect(0, 0, 320, 180);
  });
  tex(scene, 'fx_glow', 128, 128, (c) => {
    const g2 = c.createRadialGradient(64, 64, 2, 64, 64, 64);
    g2.addColorStop(0, 'rgba(255,214,140,0.55)');
    g2.addColorStop(0.45, 'rgba(255,190,100,0.22)');
    g2.addColorStop(1, 'rgba(255,180,80,0)');
    c.fillStyle = g2;
    c.fillRect(0, 0, 128, 128);
  });
  tex(scene, 'fx_flash', 8, 8, (c) => { c.fillStyle = '#ffffff'; c.fillRect(0, 0, 8, 8); });
  tex(scene, 'fx_dot', 8, 8, (c) => { dot(c, 4, 4, 4, '#ffffff'); });
  tex(scene, 'fx_star', 16, 16, (c) => {
    poly(c, [[8, 0], [10, 6], [16, 8], [10, 10], [8, 16], [6, 10], [0, 8], [6, 6]], 'rgba(255,240,180,0.95)');
  });

  // ===================== UI =====================
  tex(scene, 'ui_joybase', 150, 150, (c) => {
    dot(c, 75, 75, 70, 'rgba(255,255,255,0.09)');
    c.save();
    c.beginPath();
    c.arc(75, 75, 70, 0, Math.PI * 2);
    c.lineWidth = 3;
    c.strokeStyle = 'rgba(255,255,255,0.26)';
    c.stroke();
    c.restore();
    dot(c, 75, 75, 26, 'rgba(255,255,255,0.07)');
  });
  tex(scene, 'ui_knob', 70, 70, (c) => {
    dot(c, 35, 35, 30, 'rgba(255,255,255,0.28)');
    dot(c, 35, 35, 22, 'rgba(255,255,255,0.35)');
    dot(c, 30, 30, 8, 'rgba(255,255,255,0.55)');
  });
}
