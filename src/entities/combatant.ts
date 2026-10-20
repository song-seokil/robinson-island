import Phaser from 'phaser';
import { damageNumber, burst, dust } from '../fx/fx';
import { play } from '../core/sfx';
import { PROJ_SIN, projLift } from '../core/config';

export type Faction = 'player' | 'pirate' | 'neutral';

/** 전투 개체가 세상을 조회/조작할 때 쓰는 인터페이스 (IslandScene 이 구현) */
export interface WorldCtx {
  scene: Phaser.Scene;
  textures: Phaser.Textures.TextureManager;
  /** from 에게 적대적인 가장 가까운 개체 (maxDist 미지정 시 무제한) */
  query(from: Combatant, maxDist?: number, preferStructure?: boolean): Combatant | null;
  spawnArrow(owner: Combatant, target: Combatant, dmg: number): void;
  spawnBomb(owner: Combatant, target: Combatant, dmg: number, aoe: number): void;
  /** 근접 타격 판정 (슬래시 이펙트 + 피해) */
  meleeHit(owner: Combatant, target: Combatant, dmg: number, crit?: boolean): void;
  /** 같은 편 전체 순회 (모닥불 회복 오라 등) */
  forEachAllied(faction: Faction, cb: (c: Combatant) => void): void;
  getPlayer(): Combatant;
  /** 플레이어 기지 중심 좌표 (약탈자의 목표) */
  getBase(): { x: number; y: number };
  /** 지형 고도(타일) — 스프라이트가 지면에 서도록 띄운다 */
  elevAt(x: number, y: number): number;
  onDeath(e: Combatant): void;
}

export function hostile(a: Faction, b: Faction): boolean {
  if (a === 'neutral' || b === 'neutral') return false;
  return a !== b;
}

export interface CombatantOpts {
  radius: number;
  hp: number;
  faction: Faction;
  tex: string;
  barY?: number;        // 체력바 Y 오프셋(위)
  scale?: number;
  isStructure?: boolean;
  blocks?: boolean;
}

export abstract class Combatant extends Phaser.GameObjects.Container {
  faction: Faction;
  hp: number;
  maxHp: number;
  radius: number;
  isStructure: boolean;
  blocks: boolean;
  alive = true;
  vx = 0;
  vy = 0;
  kbx = 0;
  kby = 0;
  facing = 1;
  atkCd = 0;
  hurtT = 0;
  art: Phaser.GameObjects.Image;
  protected ctx: WorldCtx;
  private hpBg: Phaser.GameObjects.Rectangle;
  private hpFill: Phaser.GameObjects.Rectangle;
  private barW = 30;
  protected groundLift = 0;

  constructor(ctx: WorldCtx, x: number, y: number, o: CombatantOpts) {
    super(ctx.scene, x, y);
    this.ctx = ctx;
    this.faction = o.faction;
    this.hp = o.hp;
    this.maxHp = o.hp;
    this.radius = o.radius;
    this.isStructure = !!o.isStructure;
    this.blocks = !!o.blocks;

    const shadow = ctx.scene.add.image(0, 0, 'fx_shadow').setOrigin(0.5, 0.5).setScale((o.radius * 2.6) / 44, (o.radius * 1.5) / 22).setAlpha(0.75);
    this.add(shadow);

    // 3/4 뷰: 레이어가 Y 를 눌러 주므로, 스프라이트는 다시 늘려 세운다 (그리고 고도만큼 띄운다)
    const texW = ctx.textures.get(o.tex).getSourceImage()?.width || 224;
    const s = ((o.radius * 2.5) / texW) * (o.scale ?? 1);
    this.art = ctx.scene.add.image(0, 0, o.tex).setOrigin(0.5, 1).setScale(s, s / PROJ_SIN);
    this.add(this.art);

    const by = o.barY ?? -Math.round(this.art.displayHeight / PROJ_SIN + 6);
    this.hpBg = ctx.scene.add.rectangle(0, by, this.barW + 2, 5, 0x11161f, 0.85).setOrigin(0.5, 0.5).setVisible(false).setScale(1, 1 / PROJ_SIN);
    this.hpFill = ctx.scene.add.rectangle(-this.barW / 2, by, this.barW, 3, 0x5bc236, 1).setOrigin(0, 0.5).setVisible(false).setScale(1, 1 / PROJ_SIN);
    this.add(this.hpBg);
    this.add(this.hpFill);

    ctx.scene.add.existing(this);
    this.setDepth(y);
  }

  setFacing() {
    this.art.setFlipX(this.facing < 0);
  }

  /** 지형 고도에 맞춰 스프라이트를 띄운다 (3/4 뷰에서 지면에 서 보이게) */
  protected setGroundLift(h: number) {
    const lift = (projLift(h) / PROJ_SIN);
    if (Math.abs(lift - this.groundLift) < 0.5) return;
    this.groundLift = lift;
    this.art.y = -lift;
  }

  showHpBar(show: boolean) {
    const visible = show && this.hp < this.maxHp && this.alive;
    this.hpBg.setVisible(visible);
    this.hpFill.setVisible(visible);
  }

  protected refreshHpBar() {
    const r = Phaser.Math.Clamp(this.hp / this.maxHp, 0, 1);
    this.hpFill.width = this.barW * r;
    this.hpFill.fillColor = r > 0.55 ? 0x5bc236 : r > 0.28 ? 0xffc94d : 0xd9534f;
  }

  takeDamage(amount: number, opts: { crit?: boolean; from?: Combatant; knock?: number } = {}) {
    if (!this.alive) return;
    const amt = Math.max(1, Math.round(amount * (opts.crit ? 1 : 1)));
    this.hp -= amt;
    this.hurtT = 0.12;
    this.art.setTintFill(0xffffff);
    if (opts.from) {
      const dx = this.x - opts.from.x;
      const dy = this.y - opts.from.y;
      const d = Math.max(1, Math.hypot(dx, dy));
      const k = opts.knock ?? 90;
      this.kbx += (dx / d) * k;
      this.kby += (dy / d) * k;
    }
    damageNumber(this.ctx.scene, this.x, this.y - this.art.displayHeight * 0.7, amt, { crit: opts.crit });
    burst(this.ctx.scene, this.x, this.y - this.art.displayHeight * 0.5, 'fx_spark', opts.crit ? 12 : 5, {
      speed: { min: 40, max: opts.crit ? 240 : 140 },
      lifespan: { min: 180, max: 420 },
      scale: { start: opts.crit ? 1.3 : 0.8, end: 0 },
      blendMode: 'NORMAL',
      tint: [0xff8a6a, 0xd9534f],
    });
    play(opts.crit ? 'crit' : 'hit');
    this.refreshHpBar();
    this.showHpBar(true);
    if (this.hp <= 0) this.die();
  }

  heal(amount: number) {
    if (!this.alive || this.hp >= this.maxHp) return;
    this.hp = Math.min(this.maxHp, this.hp + amount);
    damageNumber(this.ctx.scene, this.x, this.y - this.art.displayHeight * 0.7, amount, { heal: true });
    this.refreshHpBar();
  }

  protected die() {
    if (!this.alive) return;
    this.alive = false;
    const sc = this.ctx.scene;
    dust(sc, this.x, this.y, 8);
    burst(sc, this.x, this.y - 8, 'fx_smoke', 6, { speed: { min: 20, max: 70 }, lifespan: { min: 400, max: 800 }, scale: { start: 0.7, end: 1.8 }, alpha: { start: 0.5, end: 0 } });
    sc.tweens.add({
      targets: this.art,
      angle: this.facing > 0 ? 82 : -82,
      alpha: 0.15,
      scaleX: this.art.scaleX * 0.9,
      duration: 340,
      ease: 'Quad.easeIn',
    });
    sc.tweens.add({
      targets: this,
      alpha: 0,
      duration: 520,
      delay: 200,
      onComplete: () => this.destroy(),
    });
    this.ctx.onDeath(this);
    this.setDepth(-50);
  }

  /** 매 프레임: 이동/넉백 적용 + 넉백 감쇠 */
  protected integrate(dt: number) {
    const damp = Math.pow(0.0016, dt);
    this.kbx *= damp;
    this.kby *= damp;
    this.x += (this.vx + this.kbx) * dt;
    this.y += (this.vy + this.kby) * dt;
    this.setGroundLift(this.ctx.elevAt(this.x, this.y));
    if (this.hurtT > 0) {
      this.hurtT -= dt;
      if (this.hurtT <= 0) this.art.clearTint();
    }
  }

  abstract update(dt: number): void;
}
