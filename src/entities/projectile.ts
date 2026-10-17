import Phaser from 'phaser';
import { Combatant, Faction } from './combatant';
import { explode, burst } from '../fx/fx';
import { play } from '../core/sfx';

export interface ProjHooks {
  damageArea(x: number, y: number, radius: number, dmg: number, faction: Faction, owner: Combatant): void;
}

/**
 * 투사체 — 화살(직선 + 약한 유도) / 폭탄(포물선 → 폭발)
 * 화살이 날아가고 폭탄이 터지는 순간이 이 게임의 "하이라이트" 중 하나.
 */
export class Projectile {
  kind: 'arrow' | 'bomb';
  img: Phaser.GameObjects.Image;
  x: number;
  y: number;
  vx = 0;
  vy = 0;
  z = 0;
  dmg: number;
  aoe: number;
  faction: Faction;
  owner: Combatant;
  target: Combatant | null;
  alive = true;
  private life = 0;
  private maxLife = 2.6;
  private sx = 0;
  private sy = 0;
  private ex = 0;
  private ey = 0;
  private t = 0;
  private dur = 0.6;
  private arc = 60;
  private trailT = 0;

  constructor(kind: 'arrow' | 'bomb', owner: Combatant, target: Combatant, dmg: number, aoe = 0) {
    this.kind = kind;
    this.owner = owner;
    this.target = target;
    this.dmg = dmg;
    this.aoe = aoe;
    this.faction = owner.faction;

    const sc = owner.scene;
    this.x = owner.x;
    this.y = owner.y - owner.art.displayHeight * 0.62;
    this.img = sc.add.image(this.x, this.y, kind === 'arrow' ? 'fx_arrow' : 'fx_bomb').setDepth(3000);

    if (kind === 'arrow') {
      // 발사 시점의 목표 위치로 사격 (유도가 있으므로 충분)
      const tx = target.x;
      const ty = target.y - target.art.displayHeight * 0.5;
      const ang = Math.atan2(ty - this.y, tx - this.x);
      this.vx = Math.cos(ang) * 430;
      this.vy = Math.sin(ang) * 430;
      this.img.setRotation(ang);
      play('shoot');
    } else {
      this.sx = this.x;
      this.sy = this.y;
      this.ex = target.x;
      this.ey = target.y;
      const d = Math.hypot(this.ex - this.sx, this.ey - this.sy);
      this.dur = Phaser.Math.Clamp(d / 240, 0.35, 1.0);
      this.arc = 50 + d * 0.22;
      this.img.setDepth(7000);
    }
  }

  update(dt: number, hooks: ProjHooks) {
    if (!this.alive) return;
    this.life += dt;

    if (this.kind === 'arrow') {
      // 약한 유도 (움직이는 표적도 맞도록)
      if (this.target && this.target.alive) {
        const tx = this.target.x;
        const ty = this.target.y - this.target.art.displayHeight * 0.5;
        const want = Math.atan2(ty - this.y, tx - this.x);
        const cur = Math.atan2(this.vy, this.vx);
        let diff = Phaser.Math.Angle.Wrap(want - cur);
        const maxTurn = 3.4 * dt;
        diff = Phaser.Math.Clamp(diff, -maxTurn, maxTurn);
        const na = cur + diff;
        const sp = 430;
        this.vx = Math.cos(na) * sp;
        this.vy = Math.sin(na) * sp;
        this.img.setRotation(na);
        const d = Math.hypot(tx - this.x, ty - this.y);
        if (d < 16) {
          this.impact();
          return;
        }
      }
      this.x += this.vx * dt;
      this.y += this.vy * dt;
      this.trailT -= dt;
      if (this.trailT <= 0) {
        this.trailT = 0.045;
        burst(this.owner.scene, this.x, this.y, 'fx_spark', 1, { speed: { min: 0, max: 12 }, lifespan: 200, scale: { start: 0.5, end: 0 }, alpha: { start: 0.5, end: 0 } });
      }
      this.img.setPosition(this.x, this.y);
      if (this.life > this.maxLife) {
        this.alive = false;
        this.img.destroy();
      }
      return;
    }

    // 폭탄: 포물선
    this.t += dt / this.dur;
    const p = Phaser.Math.Clamp(this.t, 0, 1);
    this.x = Phaser.Math.Linear(this.sx, this.ex, p);
    this.y = Phaser.Math.Linear(this.sy, this.ey, p);
    this.z = Math.sin(p * Math.PI) * this.arc;
    this.img.setPosition(this.x, this.y - this.z - 6);
    this.img.setRotation(this.img.rotation + dt * 9);
    this.img.setScale(1 + this.z / 260);
    if (p >= 1) {
      this.alive = false;
      this.img.destroy();
      explode(this.owner.scene, this.ex, this.ey, this.aoe);
      hooks.damageArea(this.ex, this.ey, this.aoe, this.dmg, this.faction, this.owner);
    }
  }

  private impact() {
    this.alive = false;
    this.img.destroy();
    const t = this.target!;
    const crit = Math.random() < 0.1;
    t.takeDamage(this.dmg * (crit ? 2 : 1), { from: this.owner, crit, knock: 14 });
    burst(this.owner.scene, t.x, t.y - 18, 'fx_spark', 6, { speed: { min: 30, max: 120 }, lifespan: 260, scale: { start: 0.7, end: 0 }, blendMode: 'NORMAL', tint: [0xff8a6a] });
  }

  destroy() {
    this.alive = false;
    this.img.destroy();
  }
}
