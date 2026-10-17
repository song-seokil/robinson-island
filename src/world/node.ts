import Phaser from 'phaser';
import { CRYSTAL_DROPS, FAMILIES, Family, NODE_KINDS, NodeKindDef, nodeHp, nodeYieldMult, requiredTier, LEVEL_MAX, C } from '../core/config';
import { chips, levelUpSparkle, floatText, ring, burst } from '../fx/fx';
import { play } from '../core/sfx';

/**
 * 자원 덩어리 — Lv.1 ~ Lv.10
 *  · 시간이 지나면 스스로 다음 레벨로 성장한다 (오프라인에서도)
 *  · 레벨이 높을수록 상위 도구가 필요하고, 산출량이 많다
 *  · 캐면 레벨이 1씩 내려간다 (덩어리를 덜어내는 느낌)
 *
 * 수정 결정(special: 'crystal')은 예외 규칙을 따른다:
 *  · 섬에 미리 배치되지 않는다 — 하루에 1개만 나타난다
 *  · 성장하지 않는다 (레벨 고정)
 *  · 캐내면 1 / 9 / 99 개가 나오고, 그 자리에서 사라진다
 */
export class ResourceNode extends Phaser.GameObjects.Container {
  id: number;
  kind: string;
  def: NodeKindDef;
  family: Family;
  level: number;
  hp: number;
  maxHp: number;
  prog: number;                 // 다음 레벨까지 진행도 0..1

  private art: Phaser.GameObjects.Image;
  private shadow: Phaser.GameObjects.Image;
  private glow: Phaser.GameObjects.Image;
  private beam?: Phaser.GameObjects.Image;
  private badge: Phaser.GameObjects.Container;
  private badgeBg: Phaser.GameObjects.Rectangle;
  private badgeText: Phaser.GameObjects.Text;
  private progBar: Phaser.GameObjects.Rectangle;
  private progFill: Phaser.GameObjects.Rectangle;
  private bumpT = 0;
  private depleted = false;     // 캐내서 사라졌는가 (수정 결정 전용)
  lastCrystalCount = 0;         // 수정 결정에서 나온 개수 (연출용)

  constructor(scene: Phaser.Scene, id: number, kind: string, x: number, y: number, level = 1, prog = 0) {
    super(scene, x, y);
    this.id = id;
    this.kind = kind;
    this.def = NODE_KINDS[kind];
    this.family = this.def.family;
    this.level = Phaser.Math.Clamp(level, 1, LEVEL_MAX);
    this.prog = prog;
    this.hp = nodeHp(this.level);
    this.maxHp = this.hp;

    // 발밑 그림자 — 덩어리가 땅에 붙어 보이게
    const shadowR = this.def.radius ?? 20;
    this.shadow = scene.add.image(0, 5, 'fx_shadow').setOrigin(0.5, 0.5)
      .setAlpha(this.family === 'oil' ? 0.3 : 0.5)
      .setScale((shadowR * 2.5) / 44, (shadowR * 1.5) / 22);
    this.add(this.shadow);

    this.glow = scene.add.image(0, -14, 'fx_glow').setScale(0.7).setAlpha(0).setBlendMode(Phaser.BlendModes.ADD);
    this.add(this.glow);

    this.art = scene.add.image(0, 6, this.def.tex).setOrigin(0.5, 1);
    this.add(this.art);
    // 3/4 레이어가 Y를 누르므로 스프라이트를 다시 늘리고, 고도만큼 띄운다
    const tw = this.def.radius * 2.3;
    this.art.setScale(tw / (this.art.width || 224), tw / (this.art.width || 224) / PROJ_SIN);

    // 레벨 배지 (플레이어가 아주 가까이 있을 때만 보인다)
    this.badge = scene.add.container(0, -this.art.height - 8);
    this.badgeBg = scene.add.rectangle(0, 0, 34, 15, 0x0e1620, 0.7).setOrigin(0.5, 0.5).setStrokeStyle(1, 0xffffff, 0.2);
    this.badgeText = scene.add
      .text(0, 0, 'Lv.1', { fontFamily: 'system-ui, "Malgun Gothic", sans-serif', fontSize: '11px', fontStyle: 'bold', color: '#ffffff' })
      .setOrigin(0.5, 0.5);
    this.progBar = scene.add.rectangle(0, 10, 30, 3, 0x000000, 0.5).setOrigin(0.5, 0.5);
    this.progFill = scene.add.rectangle(-15, 10, 30, 3, 0xffc94d, 1).setOrigin(0, 0.5);
    this.badge.add([this.badgeBg, this.badgeText, this.progBar, this.progFill]);
    this.badge.setVisible(false);
    this.add(this.badge);

    scene.add.existing(this);

    // 수정 결정: 섬 어디에 있든 눈에 띄는 빛기둥 (성장하지 않는 특수 자원)
    if (this.family === 'crystal') {
      this.beam = scene.add
        .image(0, 6, 'fx_glow')
        .setOrigin(0.5, 1)
        .setDisplaySize(38, 120)
        .setBlendMode(Phaser.BlendModes.ADD)
        .setTint(0x8ff2ff)
        .setAlpha(0.45);
      this.add(this.beam);
      scene.tweens.add({
        targets: this.beam,
        alpha: { from: 0.22, to: 0.62 },
        displayHeight: { from: 96, to: 142 },
        duration: 1500,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut',
      });
    }

    this.setDepth(y);
    this.refreshVisual(false);
  }

  /** 레벨에 따른 크기·발광·배지 색 */
  refreshVisual(animate = true) {
    const lv = this.level;
    // 3D 렌더 스프라이트는 224px 라 크기를 반지름 기준으로 되돌린다 (타일 대비 크기 유지)
    const baseW = (this.def.radius ?? 20) * 2.3;
    const texW = this.art.width || 224;
    const targetScale = baseW / texW;
    this.art.setScale(targetScale, targetScale / PROJ_SIN);
    if (animate) {
      this.scene.tweens.add({ targets: this.art, scaleX: targetScale, scaleY: targetScale, duration: 380, ease: 'Back.easeOut' });
    } else {
      this.art.setScale(targetScale);
    }
    const fam = FAMILIES[this.family];
    const glowA = lv >= 4 ? Math.min(0.55, (lv - 3) * 0.07) : 0;
    this.glow.setAlpha(glowA).setTint(fam.color).setScale(0.6 + lv * 0.06);
    const col = lv >= 9 ? '#ffe08a' : lv >= 7 ? '#ffb35c' : lv >= 5 ? '#8ff2ff' : lv >= 3 ? '#e8f4ff' : '#c8d4e0';
    this.badgeText.setText(`Lv.${lv}`).setColor(col);
    this.badgeBg.setStrokeStyle(1, lv >= 9 ? 0xffe08a : lv >= 7 ? 0xffb35c : 0x8ff2ff, lv >= 5 ? 0.75 : 0.3);
    this.setDepth(this.y);
  }

  /** 플레이어가 가까이 있으면 레벨 배지를 보여준다 (수정은 배지 없음) */
  setBadgeVisible(v: boolean) {
    if (this.family === 'crystal') v = false;
    if (this.badge.visible !== v) this.badge.setVisible(v);
  }

  setProgress(p: number) {
    this.prog = p;
    this.progFill.width = Math.max(0, Math.min(1, p)) * 30;
  }

  /** 이 덩어리에서 다음 레벨로 성장 */
  growUp() {
    // 수정 결정은 성장하지 않는다 (레벨 고정 · 하루에 1개만 나타난다)
    if (this.family === 'crystal' || this.level >= LEVEL_MAX) return;
    this.level++;
    this.hp = nodeHp(this.level);
    this.maxHp = this.hp;
    this.refreshVisual(true);
    levelUpSparkle(this.scene, this.x, this.y - 12, FAMILIES[this.family].color);
  }

  /** 필요 도구 단계 */
  requiredTier(): number {
    return requiredTier(this.level, this.family);
  }

  /**
   * 한 대 캐기.
   * @returns 'hit' | 'yield' | 'blocked'
   */
  hit(power: number, toolFamilyOk: boolean): 'hit' | 'yield' | 'blocked' {
    if (!toolFamilyOk) {
      play('ui');
      return 'blocked';
    }
    this.hp -= power;
    this.bumpT = 0.16;
    chips(this.scene, this.x, this.y - 10, FAMILIES[this.family].color, 7);
    play(this.family === 'stone' || this.family === 'crystal' ? 'mine' : this.family === 'oil' ? 'chop' : 'chop');
    if (this.hp > 0) return 'hit';
    return 'yield';
  }

  /**
   * 덩어리 하나를 캐냈다 → 산출물 + 레벨 1 감소
   * 수정 결정은 가중 추첨(1 / 9 / 99)으로 큰 보상을 주고 사라진다.
   */
  take(): { item: string; amount: number }[] {
    if (this.family === 'crystal') {
      const total = CRYSTAL_DROPS.reduce((a, b) => a + b.weight, 0);
      let roll = Math.random() * total;
      let pick = CRYSTAL_DROPS[0];
      for (const d of CRYSTAL_DROPS) { roll -= d.weight; if (roll <= 0) { pick = d; break; } }
      this.lastCrystalCount = pick.count;
      this.hide();
      ring(this.scene, this.x, this.y - 14, 0x8ff2ff, 1.3, 620);
      burst(this.scene, this.x, this.y - 16, 'fx_star', pick.count >= 9 ? 20 : 9, {
        speed: { min: 40, max: 160 },
        lifespan: 850,
        scale: { start: pick.count >= 99 ? 1.6 : 1.1, end: 0 },
        tint: 0x9fe8ff,
      });
      floatText(this.scene, this.x, this.y - 44, `+${pick.count} 수정`, '#8ff2ff', pick.count >= 9 ? 26 : 19);
      play(pick.count >= 99 ? 'win' : 'coin');
      return [{ item: 'crystal', amount: pick.count }];
    }

    const mult = nodeYieldMult(this.level);
    const out = this.def.drops.map((d) => ({
      item: d.item,
      amount: Math.max(1, Math.round(Phaser.Math.Between(d.min, d.max === d.min ? d.min + 1 : d.max) * mult)),
    }));
    this.level = Math.max(1, this.level - 1);
    this.hp = nodeHp(this.level);
    this.maxHp = this.hp;
    this.setProgress(0);
    ring(this.scene, this.x, this.y - 12, FAMILIES[this.family].color, 0.7, 360);
    this.refreshVisual(true);
    // 산출물 표시
    let i = 0;
    for (const o of out) {
      floatText(this.scene, this.x + (i - (out.length - 1) / 2) * 22, this.y - 24 - i * 6, `+${o.amount}`, '#dff7c9', 16);
      i++;
    }
    return out;
  }

  /** 수정 결정 전용: 캐내면 자리에서 사라진다 */
  private hide() {
    this.depleted = true;
    this.beam?.destroy();
    this.beam = undefined;
    this.scene.tweens.add({
      targets: this,
      alpha: 0,
      duration: 320,
      onComplete: () => this.setVisible(false),
    });
  }

  get isDepleted() {
    return this.depleted;
  }

  update(dt: number, playerNear: boolean) {
    if (this.depleted) return;
    this.setBadgeVisible(playerNear);
    if (this.bumpT > 0) {
      this.bumpT -= dt;
      const k = Math.sin((1 - this.bumpT / 0.16) * Math.PI) * 0.09;
      this.art.setScale(this.art.scaleX, this.art.scaleY * (1 - k * 0.5) + k * 0.5);
      if (this.bumpT <= 0) {
        this.art.setDisplaySize(this.art.width * (0.58 + this.level * 0.045), this.art.height * (0.58 + this.level * 0.045));
      }
    }
    if (this.family === 'oil') {
      // 타르 웅덩이 — 가끔 기포
      if (Math.random() < dt * 0.6) {
        const px = this.x + Phaser.Math.Between(-14, 14);
        const py = this.y + Phaser.Math.Between(-4, 6);
        chips(this.scene, px, py, C.oilSheen, 1);
      }
    }
  }
}
