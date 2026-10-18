import Phaser from 'phaser';
import { Combatant, WorldCtx } from './combatant';
import { PLAYER_HP, PLAYER_SPEED, PLAYER_SKINS, ItemKey, requiredTier, TIER_NAMES } from '../core/config';
import { addItem, familyTier, hasTool } from '../core/state';
import { ResourceNode } from '../world/node';
import { slash, floatText, dust, burst } from '../fx/fx';
import { play } from '../core/sfx';
import { itemIcon } from '../core/i18n';
import { bus, EV } from '../core/bus';

/**
 * 로빈슨 크루소 본인.
 * 버튼 하나로 "싸우기 + 채집"을 모두 한다 (모바일 조작 최소화).
 */
export class Player extends Combatant {
  moving = false;
  aim = 0;                    // 조준 각도(라디안)
  swingT = 0;
  private mvx = 0;
  private mvy = 0;
  private bobT = 0;
  private weaponImg: Phaser.GameObjects.Image;
  private nodes: () => ResourceNode[];
  private skinApplied = false;   // 첫 적용 때는 배너를 띄우지 않는다

  constructor(ctx: WorldCtx, x: number, y: number, nodes: () => ResourceNode[]) {
    super(ctx, x, y, { radius: 13, hp: PLAYER_HP, faction: 'player', tex: 'player', barY: -66 });
    this.nodes = nodes;
    this.weaponImg = ctx.scene.add.image(11, -26, 'w_bow').setOrigin(0.15, 0.5).setVisible(false);
    this.add(this.weaponImg);
    this.refreshWeapon();
  }

  refreshWeapon() {
    if (hasTool('bow')) {
      this.weaponImg.setTexture('w_bow').setVisible(true).setPosition(12, -28).setAngle(0);
    } else if (hasTool('spear')) {
      this.weaponImg.setTexture('w_spear').setVisible(true).setPosition(12, -20).setAngle(12);
    } else {
      this.weaponImg.setVisible(false);
    }
  }

  /**
   * 생존자 진화 — 도구 단계(1~5)에 따라 표류 → 개척 → 수정 → 동력 → 지배자로 바뀐다.
   * 외형 그림은 3장(난파 · 1일차 · 적응완료)이고 단계가 오르면 상태가 넘어간다.
   * (해당 텍스처가 없으면 u_player 로 폴백)
   */
  syncSkin(announce = false) {
    const tier = Math.max(1, Math.min(5, Math.max(familyTier('wood'), familyTier('stone'), familyTier('oil'))));
    const skin = PLAYER_SKINS[tier - 1];
    const tex = this.ctx.scene.textures.exists(skin.tex) ? skin.tex : 'u_player';
    if (this.art.texture.key === tex) { this.skinApplied = true; return; }
    this.art.setTexture(tex);
    this.art.setScale(this.art.scaleX, this.art.scaleY);   // 새 텍스처 크기에 맞춰 스케일 유지
    if (announce && this.skinApplied) {
      const sc = this.ctx.scene;
      sc.tweens.add({ targets: this.art, scaleX: this.art.scaleX * 1.35, scaleY: this.art.scaleY * 1.35, yoyo: true, duration: 260 });
      burst(sc, this.x, this.y - 20, 'fx_spark', 26, {
        speed: { min: 60, max: 220 }, lifespan: { min: 300, max: 700 },
        scale: { start: 1.3, end: 0 }, tint: [0xffd060, 0xffffff],
      });
      bus.emit(EV.BANNER, { title: `${skin.stage}의 생존자`, sub: skin.desc, icon: '✨' });
    }
    this.skinApplied = true;
  }

  setMoveVector(x: number, y: number) {
    this.mvx = x;
    this.mvy = y;
  }

  /** 채집에 쓰이는 도구의 계열별 위력 (tier) */
  familyPower(f: Parameters<typeof familyTier>[0]) {
    return familyTier(f);
  }

  update(dt: number) {
    if (!this.alive) return;
    this.atkCd = Math.max(0, this.atkCd - dt);
    if (this.swingT > 0) this.swingT -= dt;

    const moving = Math.hypot(this.mvx, this.mvy) > 0.06;
    this.moving = moving;
    const speed = PLAYER_SPEED * (this.swingT > 0 ? 0.6 : 1);
    if (moving) {
      const l = Math.hypot(this.mvx, this.mvy) || 1;
      this.vx = (this.mvx / l) * speed;
      this.vy = (this.mvy / l) * speed;
      this.aim = Math.atan2(this.vy, this.vx);
      if (Math.abs(this.vx) > 12) this.facing = this.vx > 0 ? 1 : -1;
      this.bobT += dt * 11;
      this.art.y = -Math.abs(Math.sin(this.bobT)) * 2.4;
      this.art.setAngle(Math.sin(this.bobT) * 3);
      if (Math.random() < dt * 5) dust(this.ctx.scene, this.x - this.facing * 6, this.y, 1);
    } else {
      this.vx = 0;
      this.vy = 0;
      this.bobT = 0;
      this.art.y = Phaser.Math.Linear(this.art.y, 0, Math.min(1, dt * 8));
      this.art.setAngle(Phaser.Math.Linear(this.art.angle, 0, Math.min(1, dt * 8)));
    }
    this.integrate(dt);
    this.setFacing();
    this.showHpBar(true);
    this.setDepth(this.y);
    this.weaponImg.setFlipX(this.facing < 0);
  }

  /** 버튼: 공격 or 채집 (가까운 쪽을 자동으로 고른다) */
  tryAttack() {
    if (!this.alive || this.atkCd > 0) return;
    const bow = hasTool('bow');
    const spear = hasTool('spear');
    const reach = bow ? 250 : spear ? 66 : 54;
    const dmg = bow ? 9 : 6 + (spear ? 8 : 0);
    this.atkCd = bow ? 1.0 : 0.45;
    this.swingT = 0.2;

    const enemy = this.ctx.query(this, reach);
    let node: ResourceNode | null = null;
    let nd = 1e9;
    for (const n of this.nodes()) {
      const d = Math.hypot(n.x - this.x, n.y - this.y);
      if (d < nd) { nd = d; node = n; }
    }
    const enemyD = enemy ? Math.hypot(enemy.x - this.x, enemy.y - this.y) : 1e9;

    if (bow && enemy && enemyD <= reach) {
      this.aimAt(enemy.x, enemy.y);
      this.ctx.spawnArrow(this, enemy, dmg);
      this.lungeTo(enemy.x, enemy.y, 4);
      return;
    }

    if (enemy && enemyD <= reach && enemyD <= nd + 12) {
      this.aimAt(enemy.x, enemy.y);
      this.ctx.meleeHit(this, enemy, dmg);
      slash(this.ctx.scene, enemy.x, enemy.y - 18, Math.atan2(enemy.y - this.y, enemy.x - this.x), 1.25);
      this.lungeTo(enemy.x, enemy.y, 7);
      return;
    }

    if (node && nd <= 78) {
      this.harvest(node);
      this.aimAt(node.x, node.y);
      slash(this.ctx.scene, node.x, node.y - 14, Math.atan2(node.y - this.y, node.x - this.x), 1.0);
      this.lungeTo(node.x, node.y, 6);
      return;
    }

    // 허공 휘두르기
    slash(this.ctx.scene, this.x + Math.cos(this.aim) * 22, this.y - 20 + Math.sin(this.aim) * 10, this.aim, 0.95);
    play('ui');
  }

  private aimAt(x: number, y: number) {
    this.aim = Math.atan2(y - this.y, x - this.x);
    if (Math.abs(x - this.x) > 6) this.facing = x > this.x ? 1 : -1;
  }

  private lungeTo(x: number, y: number, dist: number) {
    const a = Math.atan2(y - this.y, x - this.x);
    this.kbx += Math.cos(a) * dist * 6;
    this.kby += Math.sin(a) * dist * 6;
    this.ctx.scene.tweens.add({
      targets: this.weaponImg,
      x: this.weaponImg.x + Math.cos(a) * 8,
      y: this.weaponImg.y + Math.sin(a) * 8,
      duration: 80,
      yoyo: true,
      ease: 'Quad.easeOut',
    });
  }

  /** 자원 덩어리 캐기 — 레벨에 맞는 도구가 필요하다 */
  private harvest(node: ResourceNode) {
    const need = requiredTier(node.level, node.family);
    const own = familyTier(node.family);
    if (own < need) {
      floatText(this.ctx.scene, node.x, node.y - 30, `${TIER_NAMES[need - 1]} 필요!`, '#ffb0a0', 16);
      play('ui');
      burst(this.ctx.scene, node.x, node.y - 12, 'fx_spark', 4, { speed: { min: 20, max: 60 }, lifespan: 300, scale: { start: 0.6, end: 0 }, tint: 0x99a4b0 });
      return;
    }
    const res = node.hit(Math.max(1, own), true);
    if (res !== 'yield') return;
    const drops = node.take();
    for (const d of drops) {
      addItem(d.item as ItemKey, d.amount);
      floatText(this.ctx.scene, node.x + Phaser.Math.Between(-10, 10), node.y - 34, `+${d.amount} ${itemIcon(d.item as ItemKey)}`, '#dff7c9', 17);
    }
    this.ctx.scene.events.emit('node-harvested', node);
  }
}
