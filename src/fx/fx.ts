import Phaser from 'phaser';
import { hitstop, slowmo } from '../core/time';
import { play } from '../core/sfx';

/**
 * "하이라이트 연출" 담당 — 타격감의 핵심.
 *  · 히트스톱(찰나 정지) · 슬로모션 · 화면 흔들림
 *  · 데미지 숫자 팝 · 슬래시 궤적 · 파티클 버스트 · 충격파 링 · 화면 플래시
 */

type Scene = Phaser.Scene;

function getEmitter(scene: Scene, key: string, cfg: Phaser.Types.GameObjects.Particles.ParticleEmitterConfig) {
  const k = 'em_' + key;
  let e = scene.data.get(k) as Phaser.GameObjects.Particles.ParticleEmitter | undefined;
  if (!e) {
    e = scene.add.particles(0, 0, key, { emitting: false, ...cfg }).setDepth(6000);
    scene.data.set(k, e);
  }
  return e;
}

// ---------- 파티클 ----------
export function burst(scene: Scene, x: number, y: number, key: string, count: number, cfg?: Phaser.Types.GameObjects.Particles.ParticleEmitterConfig) {
  const e = getEmitter(scene, key, {
    speed: { min: 40, max: 170 },
    angle: { min: 0, max: 360 },
    lifespan: { min: 260, max: 620 },
    scale: { start: 1, end: 0 },
    alpha: { start: 1, end: 0 },
    blendMode: 'ADD',
    ...(cfg ?? {}),
  });
  e.explode(count, x, y);
}

export function dust(scene: Scene, x: number, y: number, count = 6) {
  const e = getEmitter(scene, 'fx_smoke', {
    speed: { min: 8, max: 46 },
    angle: { min: 0, max: 360 },
    lifespan: { min: 320, max: 700 },
    scale: { start: 0.55, end: 1.25 },
    alpha: { start: 0.5, end: 0 },
  });
  e.explode(count, x, y);
}

/** 나무/돌 부서질 때 나오는 파편 */
export function chips(scene: Scene, x: number, y: number, color: number, count = 8) {
  const e = getEmitter(scene, 'fx_dot', {
    speed: { min: 60, max: 210 },
    angle: { min: 0, max: 360 },
    lifespan: { min: 220, max: 520 },
    scale: { start: 0.85, end: 0.1 },
    alpha: { start: 1, end: 0 },
    gravityY: 420,
    tint: color,
  });
  e.explode(count, x, y);
}

export function explode(scene: Scene, x: number, y: number, radius = 52) {
  // 화구 + 파편 + 연기 + 충격파 + 화면 플래시
  burst(scene, x, y, 'fx_spark', 26, {
    speed: { min: 80, max: 300 },
    lifespan: { min: 240, max: 620 },
    scale: { start: 1.5, end: 0 },
    tint: [0xffd060, 0xff8a3a, 0xff4a2a],
  });
  burst(scene, x, y, 'fx_smoke', 12, {
    speed: { min: 20, max: 90 },
    lifespan: { min: 500, max: 1100 },
    scale: { start: 0.6, end: 2.2 },
    alpha: { start: 0.55, end: 0 },
  });
  ring(scene, x, y, 0xffc16a, radius / 34);
  flash(scene, 0xffd9a0, 0.22, 120);
  shake(scene, 230, 0.012);
  hitstop(70);
  play('boom');
}

export function ring(scene: Scene, x: number, y: number, color: number, scale = 1, dur = 330) {
  const img = scene.add.image(x, y, 'fx_ring').setDepth(5600).setTint(color).setScale(scale * 0.25).setAlpha(0.95);
  scene.tweens.add({
    targets: img,
    scale: scale,
    alpha: 0,
    duration: dur,
    ease: 'Cubic.easeOut',
    onComplete: () => img.destroy(),
  });
}

export function slash(scene: Scene, x: number, y: number, angle: number, scale = 1.15, tint = 0xffffff) {
  const img = scene.add.image(x, y, 'fx_slash').setDepth(5500).setRotation(angle).setScale(scale * 0.7).setAlpha(0.95).setTint(tint);
  scene.tweens.add({
    targets: img,
    scale,
    alpha: 0,
    rotation: angle + 0.5,
    duration: 170,
    ease: 'Quad.easeOut',
    onComplete: () => img.destroy(),
  });
}

export function flash(scene: Scene, color = 0xffffff, alpha = 0.3, dur = 110) {
  const cam = scene.cameras.main;
  const rect = scene.add
    .rectangle(cam.width / 2, cam.height / 2, cam.width * 2, cam.height * 2, color, alpha)
    .setDepth(5900)
    .setScrollFactor(0);
  scene.tweens.add({ targets: rect, alpha: 0, duration: dur, onComplete: () => rect.destroy() });
}

export function shake(scene: Scene, dur = 180, intensity = 0.006) {
  scene.cameras.main.shake(dur, intensity, false);
}

/** 데미지 숫자 — 풀링해서 재사용 */
export function damageNumber(scene: Scene, x: number, y: number, amount: number, opts: { crit?: boolean; heal?: boolean; color?: string } = {}) {
  const pool = (scene.data.get('dmgPool') as Phaser.GameObjects.Text[] | undefined) ?? [];
  if (!pool.length) {
    for (let i = 0; i < 40; i++) {
      const t = scene.add
        .text(0, 0, '', {
          fontFamily: 'system-ui, -apple-system, "Malgun Gothic", sans-serif',
          fontSize: '20px',
          fontStyle: 'bold',
          color: '#fff',
          stroke: '#12161f',
          strokeThickness: 5,
        })
        .setDepth(6100)
        .setOrigin(0.5)
        .setActive(false)
        .setVisible(false);
      pool.push(t);
    }
    scene.data.set('dmgPool', pool);
  }
  const t = pool.find((o) => !o.active) ?? pool[0];
  const crit = !!opts.crit;
  t.setText(`${opts.heal ? '+' : ''}${Math.round(amount)}`);
  t.setColor(opts.color ?? (opts.heal ? '#7dfb8f' : crit ? '#ffd451' : '#ffffff'));
  t.setFontSize(crit ? 30 : 20);
  t.setPosition(x + Phaser.Math.Between(-8, 8), y);
  t.setAlpha(1).setScale(crit ? 0.6 : 0.9).setActive(true).setVisible(true);
  scene.tweens.add({
    targets: t,
    y: y - (crit ? 52 : 38),
    scale: crit ? 1.15 : 1,
    alpha: 0,
    duration: crit ? 780 : 620,
    ease: crit ? 'Back.easeOut' : 'Quad.easeOut',
    onComplete: () => { t.setActive(false); t.setVisible(false); },
  });
  if (crit) {
    burst(scene, x, y, 'fx_star', 5, { speed: { min: 40, max: 130 }, lifespan: 420, scale: { start: 0.7, end: 0 } });
  }
}

/** 월드 좌표에 뜨는 텍스트 (자원 획득 등) */
export function floatText(scene: Scene, x: number, y: number, text: string, color = '#ffffff', size = 17) {
  const t = scene.add
    .text(x, y, text, {
      fontFamily: 'system-ui, -apple-system, "Malgun Gothic", sans-serif',
      fontSize: `${size}px`,
      fontStyle: 'bold',
      color,
      stroke: '#12161f',
      strokeThickness: 5,
    })
    .setOrigin(0.5)
    .setDepth(6050);
  scene.tweens.add({
    targets: t,
    y: y - 34,
    alpha: 0,
    duration: 720,
    ease: 'Quad.easeOut',
    onComplete: () => t.destroy(),
  });
}

export function coinSpray(scene: Scene, x: number, y: number, n = 6) {
  const e = getEmitter(scene, 'fx_coin', {
    speed: { min: 90, max: 230 },
    angle: { min: 200, max: 340 },
    lifespan: { min: 500, max: 900 },
    scale: { start: 1, end: 0.4 },
    alpha: { start: 1, end: 0 },
    gravityY: 480,
    rotate: { min: 0, max: 360 },
  });
  e.explode(n, x, y);
  play('coin');
}

// ---------- 시간 연출 ----------
export function critMoment(scene: Scene) {
  hitstop(85);
  shake(scene, 160, 0.01);
  slowmo(0.45, 260);
}

export function bossEntrance(scene: Scene, x: number, y: number) {
  slowmo(0.3, 1500);
  shake(scene, 400, 0.014);
  ring(scene, x, y, 0xff6a4a, 3.4, 700);
  ring(scene, x, y, 0xffd451, 2.2, 500);
  flash(scene, 0xff7a5a, 0.3, 260);
  burst(scene, x, y, 'fx_spark', 30, { speed: { min: 60, max: 260 }, lifespan: 900, scale: { start: 1.4, end: 0 }, tint: [0xffd060, 0xff5a3a] });
}

export function levelUpSparkle(scene: Scene, x: number, y: number, color: number) {
  burst(scene, x, y, 'fx_star', 10, {
    speed: { min: 30, max: 110 },
    lifespan: { min: 500, max: 950 },
    scale: { start: 0.9, end: 0 },
    tint: color,
  });
  ring(scene, x, y, color, 0.9, 460);
}

export function crystalRain(scene: Scene, cam: Phaser.Cameras.Scene2D.Camera, count: number) {
  // 99개 잭팟 연출: 화면 전체에 수정 파편이 쏟아진다
  const e = getEmitter(scene, 'fx_spark', {
    speed: { min: 20, max: 120 },
    angle: { min: 250, max: 290 },
    lifespan: { min: 900, max: 1700 },
    scale: { start: 1.2, end: 0 },
    tint: [0x8ff2ff, 0x67e4ff, 0xffffff],
    gravityY: 260,
  });
  for (let i = 0; i < Math.min(60, count); i++) {
    const x = cam.scrollX + Math.random() * cam.width;
    const y = cam.scrollY - 20 - Math.random() * 200;
    e.explode(1, x, y);
  }
  flash(scene, 0x9fe8ff, 0.34, 420);
  ring(scene, cam.midPoint.x, cam.midPoint.y, 0x8ff2ff, 6, 900);
}
