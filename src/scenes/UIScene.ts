import Phaser from 'phaser';
import { BUILD_DEFS, BuildId, ITEMS, ItemKey, QUESTS, RAFT_GOAL, RECIPES, TOOLS } from '../core/config';
import { bus, EV, HudInfo } from '../core/bus';
import { play } from '../core/sfx';
import { count, hasTool, state, canAfford } from '../core/state';
import { decodeShareCode, rivals } from '../net/rival';

const W = 1280;
const H = 720;

/**
 * HUD / 조작 UI.
 *  - 왼쪽 아래: 가상 조이스틱 (터치하면 그 자리에 생긴다)
 *  - 오른쪽 아래: 공격 · 건설 · 제작 · 약탈 원정 · 목표
 *  - 상단: 체력 바, 자원칩(나무·돌·석유·수정), 미니맵(섬 형태는 매번 다르다)
 */
export class UIScene extends Phaser.Scene {
  private hud: HudInfo | null = null;

  private hpFill!: Phaser.GameObjects.Rectangle;
  private hpText!: Phaser.GameObjects.Text;
  private chips = new Map<ItemKey, Phaser.GameObjects.Text>();
  private chipIcons = new Map<ItemKey, Phaser.GameObjects.Text>();
  private dayText!: Phaser.GameObjects.Text;
  private raftText!: Phaser.GameObjects.Text;
  private raidText!: Phaser.GameObjects.Text;

  private night!: Phaser.GameObjects.Rectangle;
  private vignette!: Phaser.GameObjects.Image;

  private minimap!: Phaser.GameObjects.Image;
  private mapDot!: Phaser.GameObjects.Arc;
  private mapCrystal!: Phaser.GameObjects.Arc;
  private mapCrystalRing!: Phaser.GameObjects.Arc;

  private joyBase!: Phaser.GameObjects.Image;
  private joyKnob!: Phaser.GameObjects.Image;
  private joyPointer = -1;
  private joyCenter = new Phaser.Math.Vector2();
  private joyActive = false;

  private toastText!: Phaser.GameObjects.Text;
  private toastT = 0;
  private bannerBox!: Phaser.GameObjects.Container;
  private bannerTitle!: Phaser.GameObjects.Text;
  private bannerSub!: Phaser.GameObjects.Text;
  private bannerT = 0;

  private modal!: Phaser.GameObjects.Container;
  private modalType: string | null = null;

  private buildBar!: Phaser.GameObjects.Container;
  private buildLabel!: Phaser.GameObjects.Text;
  private hpBarX?: never;

  constructor() { super('ui'); }

  create() {
    // 야간 어둠 + 비네트 (화면 고정)
    this.night = this.add.rectangle(W / 2, H / 2, W, H, 0x081226, 0).setDepth(12);
    this.vignette = this.add.image(W / 2, H / 2, 'fx_vignette').setDisplaySize(W, H).setAlpha(0.55).setDepth(13);

    this.buildTop();
    this.buildMinimap();
    this.buildButtons();
    this.buildJoystick();
    this.buildOverlays();

    this.modal = this.add.container(0, 0).setDepth(60).setVisible(false);

    // ---- 이벤트 ----
    bus.on(EV.HUD, (h: HudInfo) => this.onHud(h), this);
    bus.on(EV.HUD_REFRESH, () => { /* 다음 HUD 이벤트에서 갱신 */ }, this);
    bus.on(EV.TOAST, (t: { msg: string; icon?: string }) => this.toast(t.msg, t.icon), this);
    bus.on(EV.BANNER, (b: { title: string; sub?: string; icon?: string }) => this.banner(b.title, b.sub, b.icon), this);
    bus.on(EV.MODAL, (m: { type: string; [k: string]: unknown }) => this.openModal(m), this);
    bus.on(EV.MODAL_CLOSE, () => this.closeModal(), this);
    bus.on(EV.BUILD_MODE, (b: BuildId | null) => this.onBuildMode(b), this);
    bus.on(EV.QUEST, (q: { text: string }) => { this.banner('목표 달성!', q.text, '✅'); play('level'); }, this);

    this.events.on('shutdown', () => {
      bus.off(EV.HUD, undefined, this);
      bus.off(EV.TOAST, undefined, this);
      bus.off(EV.BANNER, undefined, this);
      bus.off(EV.MODAL, undefined, this);
      bus.off(EV.MODAL_CLOSE, undefined, this);
      bus.off(EV.BUILD_MODE, undefined, this);
      bus.off(EV.QUEST, undefined, this);
    });
  }

  // ============================================================
  // 상단 HUD
  // ============================================================
  private buildTop() {
    const g = this.add.graphics().setDepth(20);
    // 체력 바
    g.fillStyle(0x0b1420, 0.72);
    g.fillRoundedRect(14, 12, 202, 46, 12);
    g.fillStyle(0x33121a, 0.9);
    g.fillRoundedRect(28, 28, 174, 16, 8);
    this.hpFill = this.add.rectangle(30, 30, 170, 12, 0xd9534f).setOrigin(0, 0).setDepth(21);
    this.hpText = this.add.text(200, 25, '100', { fontFamily: 'system-ui, "Malgun Gothic", sans-serif', fontSize: '13px', fontStyle: 'bold', color: '#ffd9d4' }).setOrigin(1, 0).setDepth(22);
    this.add.text(32, 24, '❤️', { fontSize: '12px' }).setDepth(22);

    // 자원 칩 — 나무 · 돌 · 석유 · 수정 (이 4종이 전부다)
    const core: ItemKey[] = ['wood', 'stone', 'oil', 'crystal'];
    let x = 230;
    for (const k of core) {
      this.mkChip(x, 14, k, true);
      x += 96;
    }

    // 뗏목 진행도
    this.raftText = this.add.text(230, 52, '🛶 뗏목 0/3', { fontFamily: 'system-ui, "Malgun Gothic", sans-serif', fontSize: '13px', color: '#cfe3f7' }).setDepth(22);

    // 약탈 상태
    this.raidText = this.add.text(W / 2, 76, '', { fontFamily: 'system-ui, "Malgun Gothic", sans-serif', fontSize: '16px', fontStyle: 'bold', color: '#ffb3a0', stroke: '#12161f', strokeThickness: 5 }).setOrigin(0.5, 0).setDepth(22);

    this.dayText = this.add.text(0, 0, 'Day 1 · ☀️', { fontFamily: 'system-ui, "Malgun Gothic", sans-serif', fontSize: '15px', fontStyle: 'bold', color: '#ffeccc' }).setOrigin(1, 0).setDepth(22);
  }

  private mkChip(x: number, y: number, k: ItemKey, core: boolean) {
    const g = this.add.graphics().setDepth(20);
    g.fillStyle(0x0b1420, 0.7);
    g.fillRoundedRect(x, y, core ? 84 : 70, 26, 8);
    if (core) g.lineStyle(1.2, ITEMS[k].color, 0.5).strokeRoundedRect(x, y, core ? 84 : 70, 26, 8);
    const icon = this.add.text(x + 8, y + 13, ITEMS[k].icon, { fontSize: '14px' }).setOrigin(0, 0.5).setDepth(21);
    const t = this.add.text(x + (core ? 30 : 28), y + 13, '0', { fontFamily: 'system-ui, "Malgun Gothic", sans-serif', fontSize: '13px', fontStyle: 'bold', color: core ? '#ffffff' : '#b9cade' }).setOrigin(0, 0.5).setDepth(21);
    this.chips.set(k, t);
    this.chipIcons.set(k, icon);
  }

  private buildMinimap() {
    const size = 132;
    const g = this.add.graphics().setDepth(20);
    g.fillStyle(0x0b1420, 0.8);
    g.fillRoundedRect(W - size - 22, 12, size + 10, size + 34, 10);
    g.lineStyle(1.5, 0x8ff2ff, 0.45);
    g.strokeRoundedRect(W - size - 22, 12, size + 10, size + 34, 10);
    g.fillStyle(0x0a2233, 1);
    g.fillRect(W - size - 17, 17, size, size);
    this.minimap = this.add.image(W - size - 17, 17, 'minimap').setOrigin(0, 0).setDisplaySize(size, size).setDepth(21);
    this.mapDot = this.add.circle(0, 0, 3.2, 0xffd451).setDepth(23);
    this.add.circle(0, 0, 5.5, 0xffd451, 0).setStrokeStyle(1.5, 0xffd451, 0.7).setDepth(22).setName('mapring');
    // 수정 결정 위치 표시 (하루에 1개만 나타나는 특수 자원)
    this.mapCrystalRing = this.add.circle(0, 0, 5, 0x8ff2ff, 0).setStrokeStyle(1.6, 0x8ff2ff, 0.85).setDepth(22).setVisible(false);
    this.mapCrystal = this.add.circle(0, 0, 2.6, 0x67e4ff).setDepth(23).setVisible(false);
    this.dayText.setPosition(W - 22, size + 30);
  }

  // ============================================================
  // 조작 버튼
  // ============================================================
  private buildButtons() {
    // 공격 (크게)
    this.mkBtn(1148, 616, 52, '⚔️', '공격', () => bus.emit(EV.ACTION, 'attack'), 0x8f3a2f);
    // 건설
    this.mkBtn(1032, 654, 36, '🔨', '건설', () => this.openModal({ type: 'craft', tab: 'build' }), 0x2f5a7a);
    // 제작
    this.mkBtn(1058, 566, 36, '🧰', '제작', () => this.openModal({ type: 'craft' }), 0x2f5a7a);
    // 약탈 원정
    this.mkBtn(958, 622, 40, '🏴‍☠️', '약탈', () => bus.emit(EV.ACTION, 'raid'), 0x7a2f4f);
    // 목표
    this.mkBtn(990, 546, 32, '📜', '목표', () => this.openModal({ type: 'quests' }), 0x3a3a4a);
    // 메뉴
    this.mkBtn(1218, 200, 24, '☰', '', () => this.openModal({ type: 'menu' }), 0x333a46);
  }

  private mkBtn(x: number, y: number, r: number, icon: string, label: string, cb: () => void, color = 0x1b2836) {
    const g = this.add.graphics();
    g.fillStyle(0x000000, 0.35);
    g.fillCircle(0, 2, r + 3);
    g.fillStyle(color, 0.92);
    g.fillCircle(0, 0, r);
    g.lineStyle(2.2, 0xffffff, 0.28);
    g.strokeCircle(0, 0, r);
    g.fillStyle(0xffffff, 0.08);
    g.fillCircle(0, -r * 0.28, r * 0.72);
    const ic = this.add.text(0, label ? -r * 0.2 : 0, icon, { fontSize: `${Math.round(r * 0.95)}px` }).setOrigin(0.5);
    const parts: Phaser.GameObjects.GameObject[] = [g, ic];
    if (label) parts.push(this.add.text(0, r * 0.62, label, { fontFamily: 'system-ui, "Malgun Gothic", sans-serif', fontSize: `${Math.max(11, Math.round(r * 0.34))}px`, color: '#dfeaf6' }).setOrigin(0.5));
    const c = this.add.container(x, y, parts).setDepth(30);
    const hit = this.add.zone(0, 0, r * 2.1, r * 2.1).setOrigin(0.5).setInteractive({ useHandCursor: true });
    c.add(hit);
    hit.on('pointerdown', () => {
      this.tweens.add({ targets: c, scale: 0.88, duration: 70, yoyo: true });
      play('ui');
      cb();
    });
    return c;
  }

  // ============================================================
  // 조이스틱
  // ============================================================
  private buildJoystick() {
    this.joyBase = this.add.image(0, 0, 'ui_joybase').setDepth(31).setVisible(false);
    this.joyKnob = this.add.image(0, 0, 'ui_knob').setDepth(32).setVisible(false);

    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      // 왼쪽 아래 영역 = 조이스틱
      if (p.x < W * 0.46 && p.y > H * 0.34) {
        this.joyPointer = p.id;
        this.joyActive = true;
        this.joyCenter.set(p.x, p.y);
        this.joyBase.setPosition(p.x, p.y).setVisible(true).setScale(0.85).setAlpha(0.9);
        this.joyKnob.setPosition(p.x, p.y).setVisible(true).setScale(0.9);
        this.tweens.add({ targets: this.joyBase, scale: 1, duration: 120 });
      }
    });
    this.input.on('pointermove', (p: Phaser.Input.Pointer) => {
      if (p.id !== this.joyPointer || !this.joyActive) return;
      const dx = p.x - this.joyCenter.x;
      const dy = p.y - this.joyCenter.y;
      const d = Math.hypot(dx, dy);
      const max = 58;
      const k = d > max ? max / d : 1;
      this.joyKnob.setPosition(this.joyCenter.x + dx * k, this.joyCenter.y + dy * k);
      bus.emit(EV.MOVE, { x: (dx * k) / max, y: (dy * k) / max });
    });
    const end = (p: Phaser.Input.Pointer) => {
      if (p.id !== this.joyPointer) return;
      this.joyPointer = -1;
      this.joyActive = false;
      this.joyBase.setVisible(false);
      this.joyKnob.setVisible(false);
      bus.emit(EV.MOVE, { x: 0, y: 0 });
    };
    this.input.on('pointerup', end);
    this.input.on('pointerupoutside', end);
  }

  // ============================================================
  // 오버레이 (토스트/배너/건설바)
  // ============================================================
  private buildOverlays() {
    this.toastText = this.add.text(W / 2, H - 40, '', {
      fontFamily: 'system-ui, "Malgun Gothic", sans-serif', fontSize: '17px', fontStyle: 'bold', color: '#eaf4ff',
      stroke: '#0d141d', strokeThickness: 6, align: 'center',
    }).setOrigin(0.5).setDepth(50).setAlpha(0);

    const bg = this.add.graphics();
    bg.fillStyle(0x0b1420, 0.72);
    bg.fillRoundedRect(-300, -34, 600, 68, 14);
    bg.lineStyle(1.5, 0x8ff2ff, 0.35);
    bg.strokeRoundedRect(-300, -34, 600, 68, 14);
    this.bannerTitle = this.add.text(0, -10, '', { fontFamily: 'system-ui, "Malgun Gothic", sans-serif', fontSize: '24px', fontStyle: 'bold', color: '#ffffff' }).setOrigin(0.5);
    this.bannerSub = this.add.text(0, 16, '', { fontFamily: 'system-ui, "Malgun Gothic", sans-serif', fontSize: '14px', color: '#bfe2ff' }).setOrigin(0.5);
    this.bannerBox = this.add.container(W / 2, 128, [bg, this.bannerTitle, this.bannerSub]).setDepth(52).setAlpha(0);

    // 건설 모드 바
    const g = this.add.graphics();
    g.fillStyle(0x0b1420, 0.8);
    g.fillRoundedRect(-190, -22, 380, 44, 12);
    this.buildLabel = this.add.text(-70, 0, '', { fontFamily: 'system-ui, "Malgun Gothic", sans-serif', fontSize: '15px', color: '#dff7c9' }).setOrigin(0.5);
    const cancel = this.mkBtn(150, 0, 18, '✕', '', () => { bus.emit(EV.ACTION, 'cancelbuild'); });
    this.buildBar = this.add.container(W / 2, H - 92, [g, this.buildLabel, cancel]).setDepth(51).setVisible(false);
  }

  private toast(msg: string, icon?: string) {
    this.toastText.setText(icon ? `${icon} ${msg}` : msg);
    this.toastText.setAlpha(1);
    this.toastT = 2.6;
  }

  private banner(title: string, sub?: string, icon?: string) {
    this.bannerTitle.setText(icon ? `${icon} ${title}` : title);
    this.bannerSub.setText(sub ?? '');
    this.bannerBox.setAlpha(1).setScale(0.94);
    this.tweens.add({ targets: this.bannerBox, scale: 1, duration: 200, ease: 'Back.easeOut' });
    this.bannerT = 2.8;
  }

  private onBuildMode(b: BuildId | null) {
    this.buildBar.setVisible(!!b);
    if (b) this.buildLabel.setText(`${BUILD_DEFS[b].icon} ${BUILD_DEFS[b].name} — 설치할 위치를 터치`);
  }

  // ============================================================
  // HUD 갱신
  // ============================================================
  private onHud(h: HudInfo) {
    this.hud = h;
    const hpR = Phaser.Math.Clamp(h.hp / h.maxHp, 0, 1);
    this.hpFill.width = 170 * hpR;
    this.hpFill.fillColor = hpR > 0.55 ? 0x5bc236 : hpR > 0.28 ? 0xffc94d : 0xd9534f;
    this.hpText.setText(`${h.hp}`);
    for (const [k, t] of this.chips) {
      const v = h.inv[k] ?? 0;
      t.setText(`${v}`);
      t.setColor(v > 0 ? '#ffffff' : '#6d7d8e');
    }
    const icon = h.night ? '🌙' : '☀️';
    this.dayText.setText(`Day ${h.day} · ${icon} ${Math.round(h.dayT * 100)}%`);
    this.raftText.setText(`🛶 뗏목 ${h.raft}/${RAFT_GOAL}   ☠️ ${h.raidsWon}회 약탈 성공`);
    this.raidText.setText(h.raidLabel);
    if (this.minimap && this.mapDot) {
      const size = 132;
      const r = this.registry.get('playerPos') as { x: number; y: number } | undefined;
      if (r) {
        const sx = W - size - 17 + (r.x / (68 * 32)) * size;
        const sy = 17 + (r.y / (68 * 32)) * size;
        this.mapDot.setPosition(sx, sy);
      }
      // 수정 결정 위치 (있을 때만)
      const c = h.crystal;
      if (c) {
        const cx = W - size - 17 + (c.x / (68 * 32)) * size;
        const cy = 17 + (c.y / (68 * 32)) * size;
        this.mapCrystal.setPosition(cx, cy).setVisible(true);
        this.mapCrystalRing.setPosition(cx, cy).setVisible(true);
      } else {
        this.mapCrystal.setVisible(false);
        this.mapCrystalRing.setVisible(false);
      }
    }
    // 밤 오버레이
    const nightA = h.night ? 0.48 : 0.14;
    this.night.setFillStyle(0x081226, nightA);
  }

  update(_t: number, delta: number) {
    const dt = delta / 1000;
    if (this.toastT > 0) {
      this.toastT -= dt;
      if (this.toastT < 0.6) this.toastText.setAlpha(Math.max(0, this.toastT / 0.6));
    }
    if (this.bannerT > 0) {
      this.bannerT -= dt;
      if (this.bannerT < 0.8) this.bannerBox.setAlpha(Math.max(0, this.bannerT / 0.8));
    }
  }

  // ============================================================
  // 모달 (제작 / 목표 / 메뉴 / 공유 / 엔딩)
  // ============================================================
  private openModal(m: { type: string; [k: string]: unknown }) {
    if (this.modalType === m.type) { this.closeModal(); return; }
    this.closeModal();
    this.modalType = m.type;
    this.registry.set('modalOpen', true);
    this.modal.removeAll(true);

    const backdrop = this.add.rectangle(W / 2, H / 2, W, H, 0x02060c, 0.62).setInteractive();
    backdrop.on('pointerdown', () => this.closeModal());
    this.modal.add(backdrop);

    if (m.type === 'craft') this.buildCraftPanel();
    else if (m.type === 'quests') this.buildQuestPanel();
    else if (m.type === 'menu') this.buildMenuPanel();
    else if (m.type === 'share') this.buildSharePanel(String(m.code ?? ''));
    else if (m.type === 'ending') this.buildEndingPanel(m);

    this.modal.setVisible(true);
    this.modal.setAlpha(0);
    this.tweens.add({ targets: this.modal, alpha: 1, duration: 160 });
  }

  private closeModal() {
    this.modalType = null;
    this.registry.set('modalOpen', false);
    this.modal.removeAll(true);
    this.modal.setVisible(false);
  }

  private panelBg(w: number, h: number, title: string, sub = '') {
    const g = this.add.graphics();
    g.fillStyle(0x0d1a28, 0.97);
    g.fillRoundedRect(-w / 2, -h / 2, w, h, 18);
    g.lineStyle(2, 0x8ff2ff, 0.35);
    g.strokeRoundedRect(-w / 2, -h / 2, w, h, 18);
    g.fillStyle(0x132638, 0.9);
    g.fillRoundedRect(-w / 2, -h / 2, w, 54, { tl: 18, tr: 18, bl: 0, br: 0 });
    const t = this.add.text(-w / 2 + 22, -h / 2 + 16, title, { fontFamily: 'system-ui, "Malgun Gothic", sans-serif', fontSize: '21px', fontStyle: 'bold', color: '#ffffff' });
    const s = this.add.text(w / 2 - 22, -h / 2 + 22, sub, { fontFamily: 'system-ui, "Malgun Gothic", sans-serif', fontSize: '13px', color: '#9fc0dd' }).setOrigin(1, 0);
    const close = this.mkBtn(w / 2 - 26, -h / 2 + 27, 17, '✕', '', () => this.closeModal(), 0x3a4653);
    return [g, t, s, close];
  }

  private buildCraftPanel() {
    const w = 1010, h = 560;
    const box = this.add.container(W / 2, H / 2, this.panelBg(w, h, '제작 · 건설', `🍖 ${count('food')}  🍲 ${count('meal')}  💎 ${count('crystal')}  🛢️ ${count('oil')}`));
    this.modal.add(box);

    type Row = { id: string; icon: string; name: string; cost: Partial<Record<ItemKey, number>>; desc: string; owned: boolean; kind: string };
    const rows: Row[] = [];
    for (const t of TOOLS) {
      rows.push({ id: t.id, icon: t.icon, name: t.name, cost: t.cost, desc: t.desc, owned: hasTool(t.id), kind: 'tool' });
    }
    for (const r of RECIPES) {
      rows.push({
        id: r.id, icon: r.icon, name: r.name, cost: r.cost, desc: r.desc,
        owned: (r.id === 'spear' || r.id === 'bow') ? hasTool(r.id) : false,
        kind: r.kind === 'build' ? 'build' : 'goal',
      });
    }
    const colW = (w - 60) / 2;
    const rowH = 43;
    rows.forEach((r, i) => {
      const col = i < Math.ceil(rows.length / 2) ? 0 : 1;
      const row = col === 0 ? i : i - Math.ceil(rows.length / 2);
      const x = -w / 2 + 20 + col * (colW + 20);
      const y = -h / 2 + 68 + row * rowH;
      this.craftRow(box, x, y, colW, r);
    });
  }

  private craftRow(parent: Phaser.GameObjects.Container, x: number, y: number, w: number, r: { id: string; icon: string; name: string; cost: Partial<Record<ItemKey, number>>; desc: string; owned: boolean; kind: string }) {
    const ok = !r.owned && canAfford(r.cost);
    const g = this.add.graphics();
    g.fillStyle(r.owned ? 0x14301e : ok ? 0x16283a : 0x1a1f27, 0.9);
    g.fillRoundedRect(x, y, w, 38, 9);
    g.lineStyle(1.2, r.owned ? 0x5bc236 : ok ? 0x8ff2ff : 0x39434f, ok ? 0.7 : 0.35);
    g.strokeRoundedRect(x, y, w, 38, 9);
    const ic = this.add.text(x + 10, y + 19, r.icon, { fontSize: '18px' }).setOrigin(0, 0.5);
    const nm = this.add.text(x + 40, y + 8, r.name, { fontFamily: 'system-ui, "Malgun Gothic", sans-serif', fontSize: '14px', fontStyle: 'bold', color: r.owned ? '#9df0b0' : '#ffffff' });
    const ds = this.add.text(x + 40, y + 24, r.desc, { fontFamily: 'system-ui, "Malgun Gothic", sans-serif', fontSize: '11px', color: '#93a8bd' });
    const costStr = (Object.keys(r.cost) as ItemKey[]).map((k) => `${ITEMS[k].icon}${r.cost[k]}`).join(' ');
    const cs = this.add.text(x + w - 12, y + 19, r.owned ? '보유 중' : costStr, { fontFamily: 'system-ui, "Malgun Gothic", sans-serif', fontSize: '13px', fontStyle: 'bold', color: r.owned ? '#7ddb96' : ok ? '#dff7c9' : '#8b98a6' }).setOrigin(1, 0.5);
    parent.add([g, ic, nm, ds, cs]);
    const hit = this.add.zone(x + w / 2, y + 19, w, 38).setOrigin(0.5).setInteractive({ useHandCursor: true });
    parent.add(hit);
    hit.on('pointerdown', () => {
      if (r.owned) { play('ui'); return; }
      play('ui');
      bus.emit(EV.ACTION, `craft:${r.id}`);
      this.time.delayedCall(120, () => { this.closeModal(); this.openModal({ type: 'craft' }); });
    });
  }

  private buildQuestPanel() {
    const w = 660, h = 540;
    const box = this.add.container(W / 2, H / 2, this.panelBg(w, h, '목표', `Day ${state.day} · 🛶 ${state.raft}/${RAFT_GOAL}`));
    this.modal.add(box);
    let y = -h / 2 + 76;
    for (const q of QUESTS) {
      const done = !!state.quests[q.id];
      const g = this.add.graphics();
      g.fillStyle(done ? 0x14301e : 0x141c26, 0.85);
      g.fillRoundedRect(-w / 2 + 20, y - 18, w - 40, 38, 9);
      const mark = this.add.text(-w / 2 + 34, y, done ? '✅' : '⬜', { fontSize: '15px' }).setOrigin(0, 0.5);
      const t = this.add.text(-w / 2 + 60, y - 8, q.text, { fontFamily: 'system-ui, "Malgun Gothic", sans-serif', fontSize: '14px', fontStyle: done ? 'normal' : 'bold', color: done ? '#8fd8a5' : '#ffffff' });
      const hint = this.add.text(-w / 2 + 60, y + 10, q.hint ?? '', { fontFamily: 'system-ui, "Malgun Gothic", sans-serif', fontSize: '11px', color: '#93a8bd' });
      box.add([g, mark, t, hint]);
      y += 44;
    }
    const info = this.add.text(0, h / 2 - 26, `약탈 성공 ${state.raidsWon}회 · 처치 ${state.kills} · 밤 생존 ${state.nightsSurvived}일`, { fontFamily: 'system-ui, "Malgun Gothic", sans-serif', fontSize: '12px', color: '#9fc0dd' }).setOrigin(0.5);
    box.add(info);
  }

  private buildMenuPanel() {
    const w = 520, h = 400;
    const box = this.add.container(W / 2, H / 2, this.panelBg(w, h, '메뉴', `섬 시드 ${state.seed}`));
    this.modal.add(box);
    const mk = (y: number, label: string, action: string, color = 0x22303f) => {
      const g = this.add.graphics();
      g.fillStyle(color, 0.95);
      g.fillRoundedRect(-w / 2 + 30, y - 20, w - 60, 40, 10);
      g.lineStyle(1.2, 0xffffff, 0.15);
      g.strokeRoundedRect(-w / 2 + 30, y - 20, w - 60, 40, 10);
      const t = this.add.text(-w / 2 + 48, y, label, { fontFamily: 'system-ui, "Malgun Gothic", sans-serif', fontSize: '15px', color: '#eaf4ff' }).setOrigin(0, 0.5);
      box.add([g, t]);
      const hit = this.add.zone(0, y, w - 60, 40).setOrigin(0.5).setInteractive({ useHandCursor: true });
      box.add(hit);
      hit.on('pointerdown', () => { play('ui'); bus.emit(EV.ACTION, action); });
    };
    mk(-h / 2 + 90, '💾  저장하기', 'save');
    mk(-h / 2 + 140, '📤  내 섬 초대 코드 만들기 (친구에게 공유)', 'share');
    mk(-h / 2 + 190, `🔊  소리 ${state.muted ? '켜기' : '끄기'}`, 'mute');
    mk(-h / 2 + 240, '📥  친구 코드 붙여넣기', 'importcode');

    // 초기화 (2번 눌러야 실행)
    let armed = false;
    const g = this.add.graphics();
    g.fillStyle(0x5a1f1f, 0.95);
    g.fillRoundedRect(-w / 2 + 30, -h / 2 + 290 - 20, w - 60, 40, 10);
    const t = this.add.text(0, -h / 2 + 290, '🗑  새 섬에서 시작 (진행 초기화)', { fontFamily: 'system-ui, "Malgun Gothic", sans-serif', fontSize: '15px', color: '#ffd9d4' }).setOrigin(0.5);
    box.add([g, t]);
    const hit = this.add.zone(0, -h / 2 + 290, w - 60, 40).setOrigin(0.5).setInteractive({ useHandCursor: true });
    box.add(hit);
    hit.on('pointerdown', () => {
      play('ui');
      if (!armed) { armed = true; t.setText('⚠️ 한 번 더 누르면 초기화됩니다'); return; }
      bus.emit(EV.ACTION, 'reset');
    });
    const note = this.add.text(0, h / 2 - 26, '세이브는 이 기기에만 저장됩니다 (서버 없음)', { fontFamily: 'system-ui, "Malgun Gothic", sans-serif', fontSize: '11px', color: '#9fc0dd' }).setOrigin(0.5);
    box.add(note);
  }

  private buildSharePanel(code: string) {
    const w = 820, h = 380;
    const box = this.add.container(W / 2, H / 2, this.panelBg(w, h, '내 섬 초대 코드', '카톡으로 친구에게 보내면, 친구가 이 섬을 약탈할 수 있습니다'));
    this.modal.add(box);
    const g = this.add.graphics();
    g.fillStyle(0x08131d, 1);
    g.fillRoundedRect(-w / 2 + 30, -80, w - 60, 190, 10);
    g.lineStyle(1.2, 0x8ff2ff, 0.4);
    g.strokeRoundedRect(-w / 2 + 30, -80, w - 60, 190, 10);
    const t = this.add.text(-w / 2 + 44, -66, code, {
      fontFamily: 'Consolas, monospace', fontSize: '13px', color: '#dff7c9', wordWrap: { width: w - 96 }, lineSpacing: 4,
    });
    box.add([g, t]);
    const copied = this.add.text(0, 132, '클립보드에 복사되었습니다', { fontFamily: 'system-ui, "Malgun Gothic", sans-serif', fontSize: '13px', color: '#8ff2ff' }).setOrigin(0.5);
    box.add(copied);
    const btn = this.mkBtn(0, h / 2 - 46, 26, '📋', '복사', () => {
      void navigator.clipboard?.writeText(code).then(() => { copied.setText('복사 완료!'); }).catch(() => { copied.setText('복사 실패 — 길게 눌러 직접 복사하세요'); });
    }, 0x2f5a7a);
    box.add(btn);
  }

  private buildEndingPanel(m: { [k: string]: unknown }) {
    const w = 700, h = 440;
    const box = this.add.container(W / 2, H / 2, this.panelBg(w, h, '탈출 성공!', '뗏목 3척을 완성해 섬을 떠났다'));
    this.modal.add(box);
    const lines = [
      `생존 일수 : ${m.day ?? state.day}일`,
      `처치한 해적 : ${m.kills ?? state.kills}명`,
      `약탈 성공 : ${m.raids ?? 0}회`,
      '',
      '하지만 이 섬은 계속 자라고 있다…',
      '무한 모드로 계속 플레이할 수 있습니다.',
    ];
    lines.forEach((l, i) => {
      const t = this.add.text(0, -h / 2 + 96 + i * 30, l, { fontFamily: 'system-ui, "Malgun Gothic", sans-serif', fontSize: i === 4 ? '16px' : '15px', fontStyle: i === 4 ? 'bold' : 'normal', color: i === 4 ? '#ffe08a' : '#dbe9f7' }).setOrigin(0.5);
      box.add(t);
    });
    const btn = this.mkBtn(0, h / 2 - 52, 24, '▶️', '계속하기', () => this.closeModal(), 0x2f7a4a);
    box.add(btn);
  }
}
