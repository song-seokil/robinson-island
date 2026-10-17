import Phaser from 'phaser';
import { Combatant, WorldCtx } from './combatant';
import { UNIT_DEFS, UnitDef } from '../core/config';
import { slash, dust } from '../fx/fx';

/**
 * 전투 유닛 — 아군(프라이데이) / 야생동물(멧돼지) / 해적 약탈단
 * 행동 유형(behavior)에 따라 AI 가 달라진다.
 */
export class Unit extends Combatant {
  key: string;
  def: UnitDef;
  private wanderV = new Phaser.Math.Vector2();
  private wanderT = 0;
  private fleeT = 0;
  private wobble: number;

  constructor(ctx: WorldCtx, x: number, y: number, key: string) {
    const def = UNIT_DEFS[key];
    super(ctx, x, y, {
      radius: def.radius,
      hp: def.hp,
      faction: def.faction,
      tex: def.tex,
      scale: def.boss ? 1.15 : 1,
      barY: -(Math.round((def.boss ? 74 : 58)) + 8),
    });
    this.key = key;
    this.def = def;
    this.wobble = Math.random() * Math.PI * 2;
  }

  get isBoss() { return !!this.def.boss; }

  update(dt: number) {
    if (!this.alive) return;
    this.atkCd = Math.max(0, this.atkCd - dt);
    if (this.hurtT > 0 && this.def.behavior === 'animal') this.fleeT = 2.6;
    switch (this.def.behavior) {
      case 'follow': this.aiFollow(dt); break;
      case 'raider': this.aiRaider(dt); break;
      case 'animal': this.aiAnimal(dt); break;
      default: this.aiGuard(dt);
    }
    this.integrate(dt);
    this.setFacing();
    this.showHpBar(true);
    this.setDepth(this.y);
    if (Math.hypot(this.vx, this.vy) > 30 && Math.random() < dt * 4) {
      dust(this.ctx.scene, this.x, this.y, 1);
    }
  }

  // ---------- AI ----------
  /** 아군: 플레이어를 따라다니며 적과 교전 */
  private aiFollow(dt: number) {
    const enemy = this.ctx.query(this, 260);
    if (enemy) {
      const d = Math.hypot(enemy.x - this.x, enemy.y - this.y);
      if (d <= this.def.range) this.strike(enemy);
      else this.moveToward(enemy.x, enemy.y, dt);
      return;
    }
    const p = this.ctx.getPlayer();
    const d = Math.hypot(p.x - this.x, p.y - this.y);
    if (d > 88) this.moveToward(p.x, p.y, dt, 1.05);
    else this.stopMove();
  }

  /** 해적: 기지(구조물)를 노린다. 막는 벽은 부순다 */
  private aiRaider(dt: number) {
    let target = this.ctx.query(this, this.def.range + 8, true);
    if (!target) target = this.ctx.query(this, this.def.range + 8);
    if (target) {
      this.strike(target);
      return;
    }
    // 상위 목표: 가장 가까운 적(구조물 우선) → 없으면 기지 중심
    let goal = this.ctx.query(this, 9999, true);
    if (!goal) goal = this.ctx.query(this, 9999);
    const base = this.ctx.getBase();
    const gx = goal ? goal.x : base.x;
    const gy = goal ? goal.y : base.y;
    this.moveToward(gx, gy, dt, goal ? 1 : 0.86);
  }

  private aiGuard(dt: number) {
    const enemy = this.ctx.query(this, 300);
    if (!enemy) { this.stopMove(); return; }
    const d = Math.hypot(enemy.x - this.x, enemy.y - this.y);
    if (d <= this.def.range) this.strike(enemy);
    else this.moveToward(enemy.x, enemy.y, dt);
  }

  /** 야생동물: 배회하다 맞으면 도망 */
  private aiAnimal(dt: number) {
    if (this.fleeT > 0) {
      this.fleeT -= dt;
      const p = this.ctx.getPlayer();
      const a = Math.atan2(this.y - p.y, this.x - p.x);
      this.vx = Math.cos(a) * this.def.speed * 1.25;
      this.vy = Math.sin(a) * this.def.speed * 1.25;
      if (Math.abs(this.vx) > 6) this.facing = this.vx > 0 ? 1 : -1;
      return;
    }
    this.wanderT -= dt;
    if (this.wanderT <= 0) {
      this.wanderT = Phaser.Math.FloatBetween(1.4, 3.6);
      if (Math.random() < 0.45) {
        this.wanderV.set(0, 0);
      } else {
        const a = Math.random() * Math.PI * 2;
        this.wanderV.set(Math.cos(a), Math.sin(a));
      }
    }
    if (this.wanderV.lengthSq() > 0) {
      this.vx = this.wanderV.x * this.def.speed * 0.42;
      this.vy = this.wanderV.y * this.def.speed * 0.42;
      if (Math.abs(this.vx) > 6) this.facing = this.vx > 0 ? 1 : -1;
    } else {
      this.stopMove();
    }
  }

  // ---------- 이동/공격 ----------
  private stopMove() {
    this.vx = 0;
    this.vy = 0;
  }

  private moveToward(x: number, y: number, dt: number, mul = 1) {
    const dx = x - this.x;
    const dy = y - this.y;
    const d = Math.hypot(dx, dy) || 1;
    // 자연스러운 흔들림
    this.wobble += dt * 2.4;
    const wob = Math.sin(this.wobble) * 0.12;
    const a = Math.atan2(dy, dx) + wob;
    const sp = this.def.speed * mul;
    this.vx = Math.cos(a) * sp;
    this.vy = Math.sin(a) * sp;
    if (Math.abs(this.vx) > 8) this.facing = this.vx > 0 ? 1 : -1;
  }

  private strike(target: Combatant) {
    if (this.atkCd > 0) return;
    this.atkCd = this.def.cd * Phaser.Math.FloatBetween(0.88, 1.12);
    this.faceTo(target);
    if (this.def.ranged === 'arrow') {
      this.ctx.spawnArrow(this, target, this.def.dmg);
      return;
    }
    if (this.def.ranged === 'bomb') {
      this.ctx.spawnBomb(this, target, this.def.dmg, this.def.aoe ?? 50);
      return;
    }
    const crit = this.def.critChance ? Math.random() < this.def.critChance : false;
    this.ctx.meleeHit(this, target, this.def.dmg, crit);
    const a = Math.atan2(target.y - this.y, target.x - this.x);
    slash(this.ctx.scene, target.x - Math.cos(a) * 6, target.y - 20, a, this.isBoss ? 1.7 : 1.1, 0xffb3a0);
    // 돌진하는 느낌
    this.kbx += Math.cos(a) * 46;
    this.kby += Math.sin(a) * 46;
    this.ctx.scene.tweens.add({ targets: this.art, y: -6, duration: 90, yoyo: true, ease: 'Quad.easeOut' });
  }

  private faceTo(t: Combatant) {
    if (Math.abs(t.x - this.x) > 6) this.facing = t.x > this.x ? 1 : -1;
  }
}
