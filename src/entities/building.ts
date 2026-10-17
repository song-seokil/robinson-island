import Phaser from 'phaser';
import { Combatant, WorldCtx } from './combatant';
import { BuildDef, BuildId, BUILD_DEFS } from '../core/config';

/**
 * 건물 — 감시탑(자동 사격) · 모닥불(회복) · 팔리사드(차단) · 가시 함정 · 뗏목
 * 상대 섬에는 보물 상자/오두막이 놓인다.
 */
export class Building extends Combatant {
  key: BuildId;
  def: BuildDef;
  private flame: Phaser.GameObjects.Image | null = null;
  private glow: Phaser.GameObjects.Image | null = null;
  private healT = 0;

  constructor(ctx: WorldCtx, x: number, y: number, key: BuildId, hpOverride?: number, faction: 'player' | 'pirate' = 'player') {
    const def = BUILD_DEFS[key];
    super(ctx, x, y, {
      radius: def.radius,
      hp: hpOverride ?? def.hp,
      faction,
      tex: def.tex,
      isStructure: true,
      blocks: def.blocks,
      barY: -(def.tex === 'b_tower' ? 86 : def.tex === 'b_hut' ? 74 : 50),
    });
    this.key = key;
    this.def = def;

    if (key === 'campfire') {
      this.glow = ctx.scene.add.image(0, -12, 'fx_glow').setBlendMode(Phaser.BlendModes.ADD).setAlpha(0.6).setScale(1.25);
      this.addAt(this.glow, 1);
      this.flame = ctx.scene.add.image(0, 2, 'fx_flame').setOrigin(0.5, 1);
      this.add(this.flame);
      ctx.scene.tweens.add({
        targets: this.flame,
        scaleX: 1.14,
        scaleY: 0.86,
        duration: 260,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut',
      });
      ctx.scene.tweens.add({ targets: this.glow, alpha: 0.42, duration: 900, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    }
  }

  update(dt: number) {
    if (!this.alive) return;
    this.atkCd = Math.max(0, this.atkCd - dt);

    // 감시탑: 사거리 내 해적을 자동 사격
    if (this.def.dmg && this.def.range) {
      const target = this.ctx.query(this, this.def.range);
      if (target) {
        if (Math.abs(target.x - this.x) > 4) this.facing = target.x > this.x ? 1 : -1;
        this.setFacing();
        if (this.atkCd <= 0) {
          this.atkCd = (this.def.cd ?? 1.2) * Phaser.Math.FloatBetween(0.92, 1.08);
          this.ctx.spawnArrow(this, target, this.def.dmg);
        }
      }
    }

    // 모닥불: 아군 회복
    if (this.def.heal && this.def.healRange) {
      this.healT += dt;
      if (this.healT >= 0.5) {
        const amt = this.def.heal * this.healT;
        this.healT = 0;
        this.ctx.forEachAllied('player', (c) => {
          if (Math.hypot(c.x - this.x, c.y - this.y) <= this.def.healRange!) c.heal(amt);
        });
      }
    }

    this.showHpBar(true);
    this.setDepth(this.y + 4);
  }
}
