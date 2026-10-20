import Phaser from 'phaser';
import {
  BUILD_DEFS, BuildDef, BuildId, CRYSTAL_DROPS, C, DAY_SECONDS, Family,
  ITEMS, ItemKey, MAP_TILES, NIGHT_FROM, PROJ_SIN, QUESTS, RAFT_GOAL, RAID_REWARD, RAID_WAVES, RECIPES, Recipe,
  TILE, TOOLS, VIEW_H, WORLD_H, WORLD_W, growthSeconds, nodeHp, projLift, projY, requiredTier, LEVEL_MAX,
} from '../core/config';
import { bus, EV } from '../core/bus';
import { g } from '../core/time';
import { play, initAudio } from '../core/sfx';
import { addItem, canAfford, count, ensureNodeArrays, familyCap, familyTier, hasTool, giveTool, offlineSeconds, pay, resetSave, saveGame, state } from '../core/state';
import { generateIsland, bakeIslandTexture, makeMinimapTexture, elevAt, IslandData, T } from '../world/island';
import { buildTextures } from '../art/textures';
import { ResourceNode } from '../world/node';
import { Player } from '../entities/player';
import { Unit } from '../entities/unit';
import { Building } from '../entities/building';
import { Combatant, Faction, WorldCtx, hostile } from '../entities/combatant';
import { Projectile } from '../entities/projectile';
import { burst, coinSpray, dust, flash, floatText, ring, shake, crystalRain, bossEntrance } from '../fx/fx';
import { rivals, RivalIsland, estimatePower, encodeShareCode, decodeShareCode } from '../net/rival';

interface RaidState {
  active: boolean;
  rival: RivalIsland | null;
  wave: number;
  waveTimer: number;
  spawnedThisWave: number;
  total: number;
  killed: number;
  chest: Building | null;
  campPos: { x: number; y: number } | null;
  intro: number;
}

export class IslandScene extends Phaser.Scene {
  world!: WorldCtx;
  island!: IslandData;
  nodes: ResourceNode[] = [];
  units: Unit[] = [];
  buildings: Building[] = [];
  projectiles: Projectile[] = [];
  player!: Player;
  all: Combatant[] = [];

  private basePos = { x: 0, y: 0 };
  private dayT = 0.05;
  private buildMode: BuildId | null = null;
  private ghost: Phaser.GameObjects.Image | null = null;
  private gridGfx: Phaser.GameObjects.Graphics | null = null;
  private markGfx: Phaser.GameObjects.Graphics | null = null;
  private ghostAt = { x: 0, y: 0 };
  private placing = false;
  private moveVec = { x: 0, y: 0 };
  private keys!: Record<string, Phaser.Input.Keyboard.Key>;
  private saveT = 0;
  private hudT = 0;
  private growT = 0;
  private questT = 0;
  private lastRaid = 0;
  private postFx: Phaser.GameObjects.Image | null = null;
  private raid: RaidState = { active: false, rival: null, wave: 0, waveTimer: 0, spawnedThisWave: 0, total: 0, killed: 0, chest: null, campPos: null, intro: 0 };
  private nightSpawned = false;
  private controlsLocked = true;
  private playerDead = false;
  private spikeCd = new WeakMap<Combatant, number>();
  private questFlags = { grown4: false, tower: false, camp: false };
  /** 3/4 뷰 레이어 — 월드 좌표 오브젝트를 이 안에 넣으면 Y 가 눕는다 */
  private worldLayer!: Phaser.GameObjects.Container;
  private camFollow!: { x: number; y: number; getScaleX: () => number; getScaleY: () => number };
  private markInLayer = false;

  /** 월드 오브젝트를 3/4 레이어에 넣는다 (화면 좌표는 계속 지상 좌표) */
  private addWorld<T extends Phaser.GameObjects.GameObject>(o: T): T {
    if (this.worldLayer) this.worldLayer.add(o);
    return o;
  }

  /** 카메라가 따라갈 "투영된" 플레이어 위치 */
  private syncCameraTarget() {
    const p = this.player;
    if (!p || !this.camFollow) return;
    this.camFollow.x = p.x;
    this.camFollow.y = projY(p.y) - projLift(elevAt(this.island, p.x, p.y));
  }

  constructor() { super('island'); }

  // ============================================================
  // 생성
  // ============================================================
  create() {
    g.factor = 1;
    // 캔버스 텍스처를 여기서도 보장 생성 (부트 씬 컨텍스트가 꼬여도 안전 — 이미 있으면 건너뛴다)
    try { buildTextures(this); } catch (e) { console.warn('buildTextures', e); }
    this.nodes = [];
    this.units = [];
    this.buildings = [];
    this.projectiles = [];
    this.all = [];

    // 월드 인터페이스 (엔티티들이 세상과 상호작용하는 창구)
    const self = this;
    this.world = {
      scene: this,
      textures: this.textures,
      query(from, maxDist, preferStructure) { return self.query(from, maxDist, preferStructure); },
      spawnArrow(owner, target, dmg) { self.projectiles.push(new Projectile('arrow', owner, target, dmg)); },
      spawnBomb(owner, target, dmg, aoe) { self.projectiles.push(new Projectile('bomb', owner, target, dmg, aoe)); },
      meleeHit(owner, target, dmg, crit) {
        target.takeDamage(dmg, { from: owner, crit: !!crit, knock: crit ? 220 : 120 });
        if (crit) { g.factor = 0.35; self.time.delayedCall(160, () => { if (g.factor === 0.35) g.factor = 1; }); shake(self, 170, 0.011); }
        else if (dmg >= 20) shake(self, 120, 0.006);
      },
      forEachAllied(faction, cb) { for (const c of self.all) if (c.alive && c.faction === faction) cb(c); },
      getPlayer() { return self.player; },
      getBase() { return self.basePos; },
      elevAt(x, y) { return elevAt(self.island, x, y); },
      onDeath(e) { self.onDeath(e); },
    };

    // ---- 3/4 뷰 레이어: 월드 좌표(Y)를 눕혀 그린다 = 화면 y = y·sin47° ----
    // 이 레이어 안의 모든 오브젝트(스프라이트·이펙트·격자·사거리 원)가 자동으로 3/4 이 된다.
    // 지형 이미지(RT)는 이미 투영되어 있으므로 레이어 밖에 둔다.
    this.worldLayer = this.add.container(0, 0).setScale(1, PROJ_SIN);

    // ---- 섬 생성 ----
    this.island = generateIsland(state.seed);
    bakeIslandTexture(this, this.island);
    makeMinimapTexture(this, this.island);

    // ---- 노드 생성 (+ 오프라인 성장 반영) ----
    ensureNodeArrays(this.island.nodes.length + state.extras.length);
    const offSec = state.intro ? offlineSeconds() : 0;
    let grew = 0;
    const allSpecs: { kind: string; x: number; y: number }[] = [
      ...this.island.nodes.map((n) => ({ kind: n.kind, x: n.x, y: n.y })),
      ...state.extras.map((e) => ({ kind: e[0], x: e[1], y: e[2] })),
    ];
    allSpecs.forEach((spec, i) => {
      // level 0 = 이미 캐낸 수정 결정 → 복원하지 않는다
      if ((state.nodeLevel[i] ?? 1) <= 0) return;
      const node = new ResourceNode(this, i, spec.kind, spec.x, spec.y, state.nodeLevel[i] ?? 1, state.nodeProg[i] ?? 0);
      this.nodes.push(node);
      this.addWorld(node);
    });
    if (offSec > 0) grew = this.applyOfflineGrowth(offSec);

    // ---- 플레이어 ----
    this.basePos = { x: state.px || this.island.spawn.x, y: state.py || this.island.spawn.y };
    this.spawnPlayer(state.px || this.island.spawn.x, state.py || this.island.spawn.y);

    // ---- 저장된 건물/동료 복원 ----
    for (const b of state.buildings) this.addBuilding(b.key, b.x, b.y, b.hp, true);
    if (state.friday) {
      const f = new Unit(this.world, this.basePos.x + 40, this.basePos.y + 20, 'friday');
      this.addUnit(f);
    }

    // ---- 날씨/밤 상태 ----
    this.dayT = state.dayT ?? 0.05;
    this.nightSpawned = this.dayT > NIGHT_FROM;

    // ---- 카메라 ----
    const cam = this.cameras.main;
    cam.setBounds(0, 0, WORLD_W, VIEW_H);
    cam.setBackgroundColor(C.waterDeep);
    this.camFollow = { x: this.player.x, y: 0, getScaleX: () => 1, getScaleY: () => 1 };
    this.syncCameraTarget();
    cam.startFollow(this.camFollow, true, 0.12, 0.12);

    // ---- 물결/포스트 ----
    this.postFx = this.add.image(0, 0, 'fx_vignette').setAlpha(0).setDepth(5900).setScrollFactor(0);

    // ---- 입력 ----
    this.setupInput();

    // ---- UI 씬 ----
    if (!this.scene.isActive('ui')) this.scene.launch('ui');

    // ---- 인트로: 파도에 떠밀려 오는 장면 ----
    if (!state.intro) this.playIntro();
    else {
      this.controlsLocked = false;
      if (grew > 0) this.toast(`자리를 비운 동안 자원 ${grew}개가 성장했습니다`, '🌱');
    }

    // ---- 세이브/종료 처리 ----
    this.saveT = 0;
    this.events.on('shutdown', () => saveGame());
    if (typeof window !== 'undefined') window.addEventListener('beforeunload', () => saveGame());

    bus.emit(EV.HUD_REFRESH);
  }

  private spawnPlayer(x: number, y: number) {
    this.player = new Player(this.world, x, y, () => this.nodes);
    this.all.push(this.player);
    this.player.hp = state.hp > 0 ? state.hp : 100;
    this.playerDead = false;
    this.player.syncSkin(false);
    if (this.worldLayer) this.addWorld(this.player);
  }

  private playIntro() {
    const spawn = this.island.spawn;
    const cx = (MAP_TILES * TILE) / 2;
    const ang = Math.atan2(spawn.y - cx, spawn.x - cx);
    const startX = Phaser.Math.Clamp(spawn.x + Math.cos(ang) * 46, 40, WORLD_W - 40);
    const startY = Phaser.Math.Clamp(spawn.y + Math.sin(ang) * 46, 40, WORLD_H - 40);

    this.player.setPosition(startX, startY);
    this.player.art.setAlpha(0.4);
    this.player.setDepth(-40);
    const cam = this.cameras.main;
    cam.stopFollow();
    cam.setZoom(0.32);
    cam.centerOn(cx, WORLD_H / 2);

    bus.emit(EV.BANNER, { title: '무인도에 표류하다', sub: `『${this.island.trait.name}』 — ${this.island.trait.desc}`, icon: '🌊' });
    play('lose');

    this.time.delayedCall(2100, () => {
      cam.pan(this.player.x, this.player.y, 1400, 'Sine.easeInOut');
      cam.zoomTo(1, 1500, 'Sine.easeInOut');
    });
    this.time.delayedCall(2600, () => {
      cam.startFollow(this.player, true, 0.12, 0.12);
      // 파도에 밀려 올라오는 연출
      burst(this, this.player.x, this.player.y, 'fx_smoke', 16, { speed: { min: 30, max: 120 }, lifespan: 900, scale: { start: 0.6, end: 2.2 }, alpha: { start: 0.5, end: 0 } });
      this.tweens.add({
        targets: this.player,
        x: spawn.x,
        y: spawn.y,
        duration: 1600,
        ease: 'Quad.easeOut',
        onComplete: () => {
          this.player.art.setAlpha(1);
          this.player.setDepth(this.player.y);
          this.controlsLocked = false;
          state.intro = true;
          this.questDone('q_shore');
          this.toast('가장 먼저 나무와 돌을 모아 도구를 만들자', '⚒️');
          saveGame();
        },
      });
    });
  }

  // ============================================================
  // 입력
  // ============================================================
  private setupInput() {
    const kb = this.input.keyboard;
    if (kb) {
      this.keys = {
        up: kb.addKey(Phaser.Input.Keyboard.KeyCodes.UP),
        down: kb.addKey(Phaser.Input.Keyboard.KeyCodes.DOWN),
        left: kb.addKey(Phaser.Input.Keyboard.KeyCodes.LEFT),
        right: kb.addKey(Phaser.Input.Keyboard.KeyCodes.RIGHT),
        w: kb.addKey(Phaser.Input.Keyboard.KeyCodes.W),
        a: kb.addKey(Phaser.Input.Keyboard.KeyCodes.A),
        s: kb.addKey(Phaser.Input.Keyboard.KeyCodes.S),
        d: kb.addKey(Phaser.Input.Keyboard.KeyCodes.D),
        space: kb.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE),
        esc: kb.addKey(Phaser.Input.Keyboard.KeyCodes.ESC),
        r: kb.addKey(Phaser.Input.Keyboard.KeyCodes.R),
        b: kb.addKey(Phaser.Input.Keyboard.KeyCodes.B),
        c: kb.addKey(Phaser.Input.Keyboard.KeyCodes.C),
      };
    }

    bus.on(EV.MOVE, (v: { x: number; y: number }) => { this.moveVec = v; }, this);
    bus.on(EV.ACTION, (a: string) => this.onAction(a), this);
    bus.on(EV.BUILD_PICK, (b: BuildId | null) => this.setBuildMode(b), this);

    // 격자 위에 짓기 — 누르면 미리보기가 잡히고, 손을 떼면 그 자리에 설치된다.
    // (마우스는 움직이는 대로 미리보기가 따라온다 — CoC 처럼)
    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      initAudio();
      if (this.registry.get('modalOpen')) return;
      if (this.overUI(p)) return;
      if (this.buildMode && !p.rightButtonDown()) {
        this.placing = true;
        this.updateGhost(p.worldX, p.worldY);
        return;
      }
      this.tapBuilding(p.worldX, p.worldY);
    });

    this.input.on('pointermove', (p: Phaser.Input.Pointer) => {
      if (!this.buildMode || p.rightButtonDown() || this.registry.get('modalOpen')) return;
      if (this.overUI(p)) return;
      this.updateGhost(p.worldX, p.worldY);
    });

    this.input.on('pointerup', () => {
      if (!this.placing) return;
      this.placing = false;
      if (this.buildMode) this.tryPlace(this.ghostAt.x, this.ghostAt.y);
    });

    this.events.on('node-harvested', (node: ResourceNode) => {
      state.nodeLevel[node.id] = node.level;
      state.nodeProg[node.id] = 0;
      if (node.level >= 4) this.questFlags.grown4 = true;

      // 수정 결정: 하루에 1개뿐인 특수 자원 — 캐내면 사라진다 (level 0 으로 저장)
      if (node.isDepleted) {
        const got = node.lastCrystalCount;
        state.nodeLevel[node.id] = 0;
        this.nodes = this.nodes.filter((n) => n !== node);
        const def = CRYSTAL_DROPS.find((d) => d.count === got) ?? CRYSTAL_DROPS[0];
        if (got >= 99) {
          bus.emit(EV.BANNER, { title: def.label, sub: '수정이 산더미다!!', icon: '💎' });
          crystalRain(this, this.cameras.main, 99);
          flash(this, 0x8ff2ff, 0.34, 620);
          shake(this, 0.5, 420);
        } else if (got >= 9) {
          bus.emit(EV.BANNER, { title: def.label, sub: `수정 ${got}개 획득`, icon: '💎' });
          flash(this, 0x8ff2ff, 0.2, 420);
        } else {
          this.toast('수정 1개를 얻었다', '💎');
        }
      }
      this.checkQuests();
    });

    this.events.on('shutdown', () => {
      bus.off(EV.MOVE, undefined, this);
      bus.off(EV.ACTION, undefined, this);
      bus.off(EV.BUILD_PICK, undefined, this);
    });
  }

  private onAction(a: string) {
    if (a === 'attack') { if (!this.controlsLocked) this.player.tryAttack(); return; }
    if (a === 'raid') { void this.startRaid(); return; }
    if (a === 'menu') { bus.emit(EV.MODAL, { type: 'menu' }); return; }
    if (a.startsWith('craft:')) { this.craft(a.slice(6)); return; }
    if (a.startsWith('buildpick:')) { this.setBuildMode(a.slice(10) as BuildId); return; }
    if (a === 'cancelbuild') { this.setBuildMode(null); return; }
    if (a === 'place') { if (this.player) this.tryPlace(this.player.x + 40, this.player.y); return; }
    if (a === 'save') { saveGame(); this.toast('저장했습니다', '💾'); return; }
    if (a === 'mute') { state.muted = !state.muted; this.toast(state.muted ? '소리 꺼짐' : '소리 켜짐', state.muted ? '🔇' : '🔊'); return; }
    if (a === 'share') { void this.shareBase(); return; }
    if (a === 'importcode') { void this.importCode(); return; }
    if (a === 'reset') { resetSave(); this.scene.stop('ui'); this.scene.restart(); return; }
  }

  private onKeyUpdate() {
    if (!this.keys) return;
    const k = this.keys;
    let x = 0, y = 0;
    if (k.left.isDown || k.a.isDown) x -= 1;
    if (k.right.isDown || k.d.isDown) x += 1;
    if (k.up.isDown || k.w.isDown) y -= 1;
    if (k.down.isDown || k.s.isDown) y += 1;
    if (x !== 0 || y !== 0) this.moveVec = { x, y };
    else if (this.moveVec.x !== 0 || this.moveVec.y !== 0) {
      // 조이스틱 입력이 없을 때만 키보드 리셋
      if (!this.input.activePointer.isDown) this.moveVec = { x: 0, y: 0 };
    }
    if (Phaser.Input.Keyboard.JustDown(k.space)) this.player.tryAttack();
    if (Phaser.Input.Keyboard.JustDown(k.esc)) bus.emit(EV.MODAL, { type: 'menu' });
    if (Phaser.Input.Keyboard.JustDown(k.r)) void this.startRaid();
    if (Phaser.Input.Keyboard.JustDown(k.b)) bus.emit(EV.MODAL, { type: 'craft' });
    if (Phaser.Input.Keyboard.JustDown(k.c)) bus.emit(EV.MODAL, { type: 'craft' });
  }

  // ============================================================
  // 갱신
  // ============================================================
  update(_time: number, delta: number) {
    const dt = Math.min(0.05, (delta / 1000) * g.factor);
    const rdt = Math.min(0.05, delta / 1000);     // 실시간(성장/세이브용)
    g.fps = Math.round(1 / Math.max(0.0001, delta / 1000));

    this.onKeyUpdate();

    if (!this.controlsLocked && !this.playerDead) this.player.setMoveVector(this.moveVec.x, this.moveVec.y);
    else this.player.setMoveVector(0, 0);

    // 업데이트
    if (!this.playerDead) this.player.update(dt);
    for (const u of this.units) u.update(dt);
    for (const b of this.buildings) b.update(dt);
    for (const p of this.projectiles) p.update(dt, { damageArea: (x, y, r, d, f, o) => this.damageArea(x, y, r, d, f, o) });
    this.syncCameraTarget();

    // 노드 (배지/연출) + 성장
    const px = this.player.x, py = this.player.y;
    for (const n of this.nodes) n.update(dt, Math.hypot(n.x - px, n.y - py) < 96);

    this.growT += rdt;
    if (this.growT >= 1) {
      this.tickGrowth(this.growT);
      this.growT = 0;
      // 죽은 개체 정리
      this.all = this.all.filter((c) => c.alive || c === (this.player as Combatant));
      this.buildings = this.buildings.filter((b) => b.alive);
      this.units = this.units.filter((u) => u.alive);
    }

    this.collide();
    this.upsertSpikes(dt);
    this.cullProjectiles();

    // 시간/밤
    this.tickDay(dt);

    // 약탈 진행
    if (this.raid.active) this.tickRaid(dt);

    // 저장/HUD/퀘스트
    this.saveT += rdt;
    if (this.saveT > 12) { this.saveT = 0; this.persist(); }
    this.hudT += rdt;
    if (this.hudT > 0.1) { this.hudT = 0; this.emitHud(); }
    this.questT += rdt;
    if (this.questT > 0.6) { this.questT = 0; this.checkQuests(); }
  }

  private emitHud() {
    if (!this.player) return;
    // 미니맵 좌표용 (UI 씬이 읽어간다)
    this.registry.set('playerPos', { x: this.player.x, y: this.player.y });
    bus.emit(EV.HUD, {
      hp: this.playerDead ? 0 : Math.max(0, Math.round(this.player.hp)),
      maxHp: this.player.maxHp,
      day: state.day,
      dayT: this.dayT,
      night: this.dayT > NIGHT_FROM,
      raid: this.raid.active,
      raidLabel: this.raid.active ? (this.raid.rival ? `${this.raid.rival.name} 공략 중` : `습격 웨이브 ${Math.min(this.raid.wave + 1, RAID_WAVES.length)}/${RAID_WAVES.length}`) : '',
      inv: { ...state.inv },
      tools: { axe: hasTool('axe2'), pick: hasTool('pick2'), spear: hasTool('spear'), bow: hasTool('bow') },
      raft: state.raft,
      raftGoal: RAFT_GOAL,
      kills: state.kills,
      raidsWon: state.raidsWon,
      mode: this.buildMode ? 'build' : 'explore',
      buildId: this.buildMode,
      buildAffordable: true,
      fps: g.fps,
      crystal: (() => {
        const c = this.nodes.find((n) => n.family === 'crystal' && !n.isDepleted);
        return c ? { x: Math.round(c.x), y: Math.round(c.y) } : null;
      })(),
    });
  }

  // ---------- 성장 ----------
  private tickGrowth(sec: number) {
    for (const n of this.nodes) {
      if (n.family === 'crystal') continue;   // 수정 결정은 성장하지 않는다
      const cap = familyCap(n.family);
      if (n.level >= LEVEL_MAX || n.level >= cap) { n.setProgress(0); continue; }
      let p = (n.prog ?? 0) + sec / growthSeconds(n.level);
      if (p >= 1) {
        p = 0;
        n.growUp();
        n.setProgress(0);
        this.toast(`자원 덩어리가 성장했다 — ${n.def.name} Lv.${n.level}`, '🌱');
      } else {
        n.setProgress(p);
      }
      state.nodeLevel[n.id] = n.level;
      state.nodeProg[n.id] = n.prog;
    }
  }

  /** 오프라인 성장 반영 (최대 8시간) */
  private applyOfflineGrowth(sec: number) {
    let ups = 0;
    for (const n of this.nodes) {
      if (n.family === 'crystal') continue;   // 수정 결정은 성장하지 않는다
      const cap = familyCap(n.family);
      let remain = sec;
      let guard = 0;
      while (remain > 0 && n.level < Math.min(LEVEL_MAX, cap) && guard++ < 400) {
        const need = growthSeconds(n.level) * (1 - (n.prog ?? 0));
        if (remain >= need) {
          remain -= need;
          n.level++;
          n.hp = nodeHp(n.level);
          n.maxHp = n.hp;
          n.prog = 0;
          ups++;
        } else {
          n.setProgress(n.prog + remain / growthSeconds(n.level));
          remain = 0;
        }
      }
      n.refreshVisual(false);
      state.nodeLevel[n.id] = n.level;
      state.nodeProg[n.id] = n.prog;
    }
    return ups;
  }

  // ---------- 하루/밤 ----------
  private tickDay(dt: number) {
    this.dayT += dt / DAY_SECONDS;
    if (this.dayT >= 1) {
      this.dayT -= 1;
      this.nextDay();
    }
    const night = this.dayT > NIGHT_FROM;
    if (night && !this.nightSpawned) {
      this.nightSpawned = true;
      this.onNightStart();
    }
    if (!night && this.nightSpawned) {
      this.nightSpawned = false;
      state.nightsSurvived++;
    }
    state.dayT = this.dayT;
    // 비네트(밤 분위기)
    if (this.postFx) this.postFx.setAlpha(night ? 0.5 + Math.sin(this.dayT * 40) * 0.02 : 0.12);
  }

  private nextDay() {
    state.day++;
    this.toast(`새벽이 밝았다 — Day ${state.day}`, '🌅');
    this.checkQuests();
  }

  private onNightStart() {
    bus.emit(EV.BANNER, { title: '밤이 되었다', sub: '해적들이 어둠을 틈타 상륙한다', icon: '🌙' });
    play('horn');
    // 해적 야습
    const n = Phaser.Math.Between(2, 3);
    for (let i = 0; i < n; i++) {
      this.spawnPirateAtBeach({ x: 0, y: 0 }, 'raider');
    }
    // 첫 밤 생존 → 프라이데이 합류
    if (state.nightsSurvived >= 1 && !state.friday && !this.units.some((u) => u.key === 'friday')) {
      const f = new Unit(this.world, this.basePos.x + 30, this.basePos.y, 'friday');
      this.addUnit(f);
      state.friday = true;
      bus.emit(EV.BANNER, { title: '프라이데이 합류!', sub: '구조한 원주민이 함께 싸운다', icon: '🤝' });
      ring(this, f.x, f.y, 0x9fe8ff, 2, 600);
      this.questDone('q_friday');
    }
  }

  // ---------- 충돌 ----------
  private collide() {
    // 1) 유닛 ↔ 벽
    for (const c of this.all) {
      if (!c.alive || c.isStructure) continue;
      for (const b of this.buildings) {
        if (!b.alive || !b.blocks) continue;
        const hw = (b.def.w ?? 30) / 2, hh = (b.def.h ?? 30) / 2;
        const dx = c.x - b.x, dy = c.y - b.y;
        const cx = Phaser.Math.Clamp(dx, -hw, hw), cy = Phaser.Math.Clamp(dy, -hh, hh);
        const ox = dx - cx, oy = dy - cy;
        const d2 = ox * ox + oy * oy;
        if (d2 < c.radius * c.radius) {
          const d = Math.sqrt(d2) || 0.001;
          const push = (c.radius - d) / d;
          // 모서리/측면 구분 없이 밀어내기
          if (d2 > 0.0001) {
            c.x += ox * push;
            c.y += oy * push;
          } else {
            // 사각형 내부: 가장 가까운 변으로
            const l = Math.abs(dx + hw), r = Math.abs(hw - dx), t = Math.abs(dy + hh), bot = Math.abs(hh - dy);
            const m = Math.min(l, r, t, bot);
            if (m === l) c.x = b.x - hw - c.radius;
            else if (m === r) c.x = b.x + hw + c.radius;
            else if (m === t) c.y = b.y - hh - c.radius;
            else c.y = b.y + hh + c.radius;
          }
        }
      }
    }
    // 2) 유닛 간 분리
    const list = this.all.filter((c) => c.alive && !c.isStructure);
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const a = list[i], b = list[j];
        const dx = b.x - a.x, dy = b.y - a.y;
        const rr = a.radius + b.radius;
        const d2 = dx * dx + dy * dy;
        if (d2 < rr * rr && d2 > 0.0001) {
          const d = Math.sqrt(d2);
          const ov = (rr - d) / d * 0.5;
          a.x -= dx * ov; a.y -= dy * ov;
          b.x += dx * ov; b.y += dy * ov;
        }
      }
    }
    // 3) 월드 경계
    for (const c of this.all) {
      if (!c.alive) continue;
      c.x = Phaser.Math.Clamp(c.x, 8, WORLD_W - 8);
      c.y = Phaser.Math.Clamp(c.y, 8, WORLD_H - 8);
    }
  }

  private upsertSpikes(dt: number) {
    for (const b of this.buildings) {
      if (!b.alive || !b.def.touchDmg) continue;
      for (const c of this.all) {
        if (!c.alive || c.isStructure || !hostile(b.faction, c.faction)) continue;
        if (Math.hypot(c.x - b.x, c.y - b.y) > b.radius + c.radius) continue;
        const last = this.spikeCd.get(c) ?? 0;
        if (this.time.now - last < 900) continue;
        this.spikeCd.set(c, this.time.now);
        c.takeDamage(b.def.touchDmg, { from: b, knock: 60 });
        burst(this, c.x, c.y - 12, 'fx_spark', 6, { speed: { min: 30, max: 120 }, lifespan: 300, scale: { start: 0.8, end: 0 }, tint: [0xffb3a0] });
      }
      void dt;
    }
  }

  private cullProjectiles() {
    this.projectiles = this.projectiles.filter((p) => p.alive);
  }

  // ============================================================
  // 전투 조회
  // ============================================================
  private query(from: Combatant, maxDist?: number, preferStructure = false): Combatant | null {
    let best: Combatant | null = null;
    let bestD = maxDist ?? Infinity;
    let bestStruct: Combatant | null = null;
    let bestStructD = maxDist ?? Infinity;
    for (const c of this.all) {
      if (!c.alive || c === from) continue;
      if (!hostile(from.faction, c.faction)) continue;
      const dx = c.x - from.x, dy = c.y - from.y;
      const d = Math.hypot(dx, dy);
      if (d < bestD) { bestD = d; best = c; }
      if (c.isStructure && d < bestStructD) { bestStructD = d; bestStruct = c; }
    }
    if (preferStructure && bestStruct) return bestStruct;
    return best;
  }

  private damageArea(x: number, y: number, radius: number, dmg: number, faction: Faction, owner: Combatant) {
    for (const c of this.all) {
      if (!c.alive || c === owner) continue;
      if (!hostile(faction, c.faction)) continue;
      const d = Math.hypot(c.x - x, c.y - y);
      if (d <= radius + c.radius * 0.5) {
        const falloff = Phaser.Math.Clamp(1 - d / (radius * 1.6), 0.45, 1);
        c.takeDamage(dmg * falloff, { from: { x, y } as unknown as Combatant, knock: 200 });
      }
    }
    shake(this, 260, 0.014);
  }

  private onDeath(e: Combatant) {
    // 시체 정리
    if (e === (this.player as Combatant)) { this.onPlayerDown(); return; }
    if (e instanceof Unit) {
      state.kills++;
      // 드랍
      const drops = e.def.drops;
      if (drops) {
        for (const k of Object.keys(drops) as ItemKey[]) {
          const n = drops[k] ?? 0;
          if (n <= 0) continue;
          addItem(k, n);
          floatText(this, e.x, e.y - 30, `+${n} ${ITEMS[k].icon}`, '#ffe08a', 17);
        }
      }
      if (e.isBoss) {
        bus.emit(EV.BANNER, { title: '해적 두목 격파!', icon: '💀' });
        play('win');
      }
      if (this.raid.active) {
        this.raid.killed++;
        if (this.raid.chest && !this.raid.chest.alive && this.raid.rival) this.raidVictory();
      }
    }
    if (e instanceof Building) {
      state.buildings = state.buildings.filter((b) => Math.hypot(b.x - e.x, b.y - e.y) > 2);
      if (e === this.raid.chest && this.raid.rival) this.raidVictory();
      burst(this, e.x, e.y - 16, 'fx_smoke', 10, { speed: { min: 20, max: 80 }, lifespan: 700, scale: { start: 0.8, end: 2 } });
      shake(this, 200, 0.01);
      void this.time.delayedCall(60, () => {
        this.buildings = this.buildings.filter((b) => b.alive);
        this.all = this.all.filter((c) => c.alive);
      });
    }
    void this.time.delayedCall(30, () => {
      this.units = this.units.filter((u) => u.alive);
    });
  }

  private onPlayerDown() {
    this.playerDead = true;
    play('lose');
    bus.emit(EV.BANNER, { title: '쓰러졌다…', sub: '의식이 돌아오니 기지 근처다', icon: '💀' });
    flash(this, 0x000000, 0.75, 400);
    // 자원 약탈당함 (수정/금화는 제외)
    for (const k of ['wood', 'stone', 'oil'] as ItemKey[]) {
      const lost = Math.floor(count(k) * 0.25);
      if (lost > 0) { state.inv[k] = count(k) - lost; }
    }
    state.hp = 60;
    this.raid.active = false;
    this.time.delayedCall(1200, () => {
      this.spawnPlayer(this.basePos.x, this.basePos.y + 20);
      this.player.hp = 60;
      this.cameras.main.startFollow(this.player, true, 0.12, 0.12);
      burst(this, this.player.x, this.player.y, 'fx_spark', 18, { speed: { min: 40, max: 140 }, lifespan: 700, scale: { start: 1, end: 0 } });
      this.all = this.all.filter((c) => c.alive);
      this.all.push(this.player);
      this.persist();
    });
  }

  // ============================================================
  // 제작 / 건설
  // ============================================================
  private craft(id: string) {
    // 도구
    const tool = TOOLS.find((t) => t.id === id);
    if (tool) {
      if (hasTool(id)) { this.toast('이미 보유한 도구다', '✔️'); return; }
      if (!canAfford(tool.cost)) { this.toast(`재료가 부족하다 (${this.costText(tool.cost)})`, '❌'); play('ui'); return; }
      pay(tool.cost);
      giveTool(id);
      play('craft');
      this.flashCraft(`${tool.icon} ${tool.name}`);
      this.checkQuests();
      bus.emit(EV.HUD_REFRESH);
      return;
    }
    // 생존/건설 아이템
    const rec = RECIPES.find((r) => r.id === id);
    if (!rec) return;
    if (rec.id === 'spear' || rec.id === 'bow') {
      if (hasTool(rec.id)) { this.toast('이미 보유 중이다', '✔️'); return; }
      if (!canAfford(rec.cost)) { this.toast(`재료가 부족하다 (${this.costText(rec.cost)})`, '❌'); play('ui'); return; }
      pay(rec.cost);
      giveTool(rec.id);
      this.player.refreshWeapon();
      this.player.syncSkin(true);
      play('craft');
      this.flashCraft(`${rec.icon} ${rec.name}`);
      this.checkQuests();
      bus.emit(EV.HUD_REFRESH);
      return;
    }
    if (rec.build) this.setBuildMode(rec.build);
  }

  private costText(cost: Partial<Record<ItemKey, number>>): string {
    return (Object.keys(cost) as ItemKey[]).map((k) => `${ITEMS[k].icon}${count(k)}/${cost[k]}`).join(' ');
  }

  private flashCraft(label: string) {
    bus.emit(EV.BANNER, { title: `${label} 제작 완료`, icon: '✨' });
    ring(this, this.player.x, this.player.y - 20, 0xffd451, 1.4, 520);
  }

  /** UI 버튼 영역(오른쪽 아래 / 왼쪽 아래)인가 — 건설 배치에서 제외 */
  private overUI(p: Phaser.Input.Pointer): boolean {
    if (p.x > this.scale.width - 360 && p.y > this.scale.height - 280) return true;
    if (p.x < this.scale.width * 0.46 && p.y > this.scale.height * 0.34) return true;
    return false;
  }

  /** 월드 좌표 → 격자 칸 중앙 */
  private snapTile(wx: number, wy: number) {
    return {
      x: Math.floor(wx / TILE) * TILE + TILE / 2,
      y: Math.floor(wy / TILE) * TILE + TILE / 2,
    };
  }

  /** 이 자리에 지을 수 있나 — 안 되면 이유를 돌려준다 */
  private canPlaceAt(x: number, y: number, def: BuildDef): { msg: string; icon: string } | null {
    if (!this.isLand(x, y)) return { msg: '물 위에는 지을 수 없다', icon: '🌊' };
    if (Math.hypot(x - this.player.x, y - this.player.y) > 260) return { msg: '너무 멀다 — 가까이로 이동하자', icon: '🚶' };
    for (const b of this.buildings) {
      if (Math.hypot(b.x - x, b.y - y) < (b.def.radius + def.radius) * 0.9) return { msg: '다른 구조물과 겹친다', icon: '🚧' };
    }
    return null;
  }

  /** 격자 판 — 건설 중에만 드러난다 */
  private showBuildGrid(on: boolean) {
    if (on && !this.gridGfx) {
      const g = this.add.graphics().setDepth(-60).setAlpha(0);
      if (this.worldLayer) this.addWorld(g);
      g.lineStyle(1, 0xffffff, 0.07);
      for (let x = 0; x <= MAP_TILES; x++) g.lineBetween(x * TILE, 0, x * TILE, WORLD_H);
      for (let y = 0; y <= MAP_TILES; y++) g.lineBetween(0, y * TILE, WORLD_W, y * TILE);
      g.lineStyle(1, 0xffffff, 0.06);
      for (let x = 0; x <= MAP_TILES; x += 4) g.lineBetween(x * TILE, 0, x * TILE, WORLD_H);
      for (let y = 0; y <= MAP_TILES; y += 4) g.lineBetween(0, y * TILE, WORLD_W, y * TILE);
      this.gridGfx = g;
    }
    const g = this.gridGfx;
    if (!g) return;
    this.tweens.killTweensOf(g);
    if (on) {
      g.setVisible(true);
      this.tweens.add({ targets: g, alpha: 1, duration: 150 });
    } else {
      this.tweens.add({
        targets: g, alpha: 0, duration: 150,
        onComplete: () => { g.destroy(); if (this.gridGfx === g) this.gridGfx = null; },
      });
    }
  }

  /** 배치 미리보기 — 격자 칸 + (방어 건물이면) 사거리 원 */
  private drawMarker(x: number, y: number, def: BuildDef, ok: boolean) {
    const g = this.markGfx ?? (this.markGfx = this.add.graphics().setDepth(3900));
    if (!this.markInLayer) { this.addWorld(this.markGfx); this.markInLayer = true; }
    const col = ok ? 0x7dff9a : 0xff6a5a;
    g.clear();
    if (def.range) {
      g.fillStyle(col, 0.05);
      g.fillCircle(0, 0, def.range);
      g.lineStyle(2, col, 0.45);
      g.strokeCircle(0, 0, def.range);
      g.lineStyle(1, col, 0.2);
      g.strokeCircle(0, 0, def.range * 0.5);
    }
    g.fillStyle(col, 0.16);
    g.fillRect(-TILE / 2, -TILE / 2, TILE, TILE);
    g.lineStyle(2, 0xffffff, ok ? 0.7 : 0.45);
    g.strokeRect(-TILE / 2, -TILE / 2, TILE, TILE);
    g.setPosition(x, y).setVisible(true).setAlpha(1);
  }

  private clearMarker() {
    if (this.markGfx) {
      this.tweens.killTweensOf(this.markGfx);
      this.markGfx.clear();
      this.markGfx.setVisible(false);
      this.markGfx.setAlpha(1);
    }
  }

  /** 세워둔 방어 건물을 톡 누르면 사거리를 보여준다 */
  private tapBuilding(wx: number, wy: number) {
    const b = this.buildings.find((t) => t.def.range && Math.hypot(t.x - wx, t.y - wy) < 36);
    if (!b || !b.def.range) return;
    const g = this.markGfx ?? (this.markGfx = this.add.graphics().setDepth(3900));
    if (!this.markInLayer) { this.addWorld(this.markGfx); this.markInLayer = true; }
    const r = b.def.range;
    this.tweens.killTweensOf(g);
    g.clear();
    g.fillStyle(0x8ff2ff, 0.07);
    g.fillCircle(0, 0, r);
    g.lineStyle(2, 0x8ff2ff, 0.65);
    g.strokeCircle(0, 0, r);
    g.setPosition(b.x, b.y).setVisible(true).setAlpha(1);
    this.tweens.add({
      targets: g, alpha: 0.2, delay: 900, duration: 500,
      onComplete: () => this.clearMarker(),
    });
  }

  private updateGhost(wx: number, wy: number) {
    if (!this.buildMode || !this.ghost) return;
    const def = BUILD_DEFS[this.buildMode];
    const s = this.snapTile(wx, wy);
    this.ghostAt = s;
    this.ghost.setPosition(s.x, s.y);
    const why = this.canPlaceAt(s.x, s.y, def);
    this.ghost.setTint(why ? 0xff6a5a : 0x7dff9a).setAlpha(0.6);
    this.drawMarker(s.x, s.y, def, !why);
  }

  private setBuildMode(b: BuildId | null) {
    this.buildMode = b;
    this.placing = false;
    bus.emit(EV.BUILD_MODE, b);
    if (this.ghost) { this.ghost.destroy(); this.ghost = null; }
    if (b) {
      const def = BUILD_DEFS[b];
      const s = this.snapTile(this.player.x, this.player.y + 40);
      this.ghost = this.add.image(s.x, s.y, def.tex).setAlpha(0.6).setDepth(4000);
      this.showBuildGrid(true);
      this.updateGhost(s.x, s.y);
      this.toast(`설치할 위치를 터치하세요 — ${def.name}`, def.icon);
    } else {
      this.showBuildGrid(false);
      this.clearMarker();
    }
  }

  private tryPlace(wx: number, wy: number) {
    if (!this.buildMode) return;
    const key = this.buildMode;
    const def = BUILD_DEFS[key];
    const rec = RECIPES.find((r) => r.build === key);
    // 격자 스냅 — 칸 중앙
    const s = this.snapTile(wx, wy);
    const why = this.canPlaceAt(s.x, s.y, def);
    if (why) { this.toast(why.msg, why.icon); play('ui'); return; }
    if (rec && !canAfford(rec.cost)) { this.toast(`재료가 부족하다 (${this.costText(rec.cost)})`, '❌'); play('ui'); return; }
    if (rec) pay(rec.cost);
    const b = this.addBuilding(key, s.x, s.y, def.hp, false);
    play('place');
    dust(this, s.x, s.y, 10);
    ring(this, s.x, s.y, 0x9fe8ff, 1.1, 420);
    if (key === 'campfire') { this.basePos = { x: s.x, y: s.y }; this.questFlags.camp = true; }
    if (key === 'tower') this.questFlags.tower = true;
    if (key === 'raft') {
      state.raft++;
      if (state.raft >= RAFT_GOAL) this.ending();
      else this.toast(`뗏목 ${state.raft}/${RAFT_GOAL}척 — 탈출 준비 중`, '🛶');
    }
    this.setBuildMode(null);
    this.checkQuests();
    bus.emit(EV.HUD_REFRESH);
    void b;
  }

  private isLand(x: number, y: number): boolean {
    const tx = Math.floor(x / TILE), ty = Math.floor(y / TILE);
    if (tx < 0 || ty < 0 || tx >= this.island.w || ty >= this.island.h) return false;
    const t = this.island.tiles[ty * this.island.w + tx];
    return t !== T.WATER && t !== T.WATER_DEEP;
  }

  private addBuilding(key: BuildId, x: number, y: number, hp: number, restoring: boolean): Building {
    const b = new Building(this.world, x, y, key, hp, 'player');
    this.addWorld(b);
    this.buildings.push(b);
    this.all.push(b);
    if (!restoring && key !== 'raft') {
      state.buildings.push({ key, x, y, hp: b.hp });
    }
    return b;
  }

  // ============================================================
  // 약탈(원정) — 상대 섬/야영지 공략
  // ============================================================
  private async startRaid() {
    if (this.raid.active) { this.toast('이미 약탈 중이다', '⚔️'); return; }
    if (this.time.now - this.lastRaid < 4000) return;
    const power = estimatePower(state.nodeLevel, state.buildings.length, state.kills);
    const rival = await rivals.matchmake(power);
    this.lastRaid = this.time.now;
    // 야영지 위치: 기지에서 먼 해변
    const far = this.island.beach
      .filter((p) => Math.hypot(p.x - this.player.x, p.y - this.player.y) > 700)
      .sort((a, b) => Math.hypot(b.x - this.player.x, b.y - this.player.y) - Math.hypot(a.x - this.player.x, a.y - this.player.y));
    const spot = far.length ? far[Phaser.Math.Between(0, Math.min(4, far.length - 1))] : this.island.beach[0] ?? this.island.spawn;
    this.raid = {
      active: true, rival, wave: 0, waveTimer: 0, spawnedThisWave: 0, total: 0, killed: 0, chest: null,
      campPos: { x: spot.x, y: spot.y }, intro: 1.2,
    };
    bus.emit(EV.BANNER, { title: `${rival.name} 야영지를 발견!`, sub: `전력 ${rival.power} — 보물 상자를 파괴하라`, icon: '🏴‍☠️' });
    play('horn');
    // 지도에 야영지 이정표
    const marker = this.add.circle(spot.x, spot.y - 40, 10, 0xff5a4a, 0.9).setDepth(5000);
    this.tweens.add({ targets: marker, scale: 1.6, alpha: 0.2, duration: 700, repeat: 5, yoyo: true });
    this.time.delayedCall(4200, () => marker.destroy());
  }

  private buildRivalCamp(rival: RivalIsland, cx: number, cy: number) {
    const SP = 34;
    for (const b of rival.layout) {
      const x = cx + b.x * SP, y = cy + b.y * SP;
      if (!this.isLand(x, y)) continue;
      const bd = new Building(this.world, x, y, b.key, b.hp, 'pirate');
      this.addWorld(bd);
      this.buildings.push(bd);
      this.all.push(bd);
      if (b.key === 'chest') this.raid.chest = bd;
    }
    for (const g of rival.guards) {
      const u = new Unit(this.world, cx + g.x * SP, cy + g.y * SP, g.kind);
      this.addWorld(u);
      this.units.push(u);
      this.all.push(u);
      this.raid.total++;
      if (u.isBoss) {
        bossEntrance(this, u.x, u.y);
        bus.emit(EV.BANNER, { title: `${rival.name} 두목 등장!`, icon: '☠️' });
      }
    }
  }

  private tickRaid(dt: number) {
    const r = this.raid;
    if (r.intro > 0) {
      r.intro -= dt;
      if (r.intro <= 0 && r.rival && r.campPos) {
        flash(this, 0x8ff2ff, 0.2, 200);
        this.buildRivalCamp(r.rival, r.campPos.x, r.campPos.y);
        // 야영지로 카메라 잠깐 보여주기
        const cam = this.cameras.main;
        cam.stopFollow();
        cam.pan(r.campPos.x, r.campPos.y, 1200, 'Sine.easeInOut');
        this.time.delayedCall(2000, () => cam.startFollow(this.player, true, 0.12, 0.12));
      }
      return;
    }
    if (!r.rival) return;
    const alive = this.units.filter((u) => u.alive && u.faction === 'pirate');
    if (alive.length === 0) this.raidVictory();
    void dt;
  }

  private raidVictory() {
    if (!this.raid.active) return;
    const r = this.raid;
    r.active = false;
    if (!r.rival) return;
    state.raidsWon++;
    play('win');
    for (const k of Object.keys(r.rival.loot) as ItemKey[]) {
      const n = r.rival.loot[k] ?? 0;
      if (n > 0) addItem(k, n);
    }
    const lootTxt = (Object.keys(r.rival.loot) as ItemKey[]).map((k) => `${ITEMS[k].icon}${r.rival!.loot[k]}`).join('  ');
    bus.emit(EV.BANNER, { title: `${r.rival.name} 약탈 성공!`, sub: lootTxt, icon: '🏆' });
    coinSpray(this, this.player.x, this.player.y - 30, 12);
    flash(this, 0xffd451, 0.25, 300);
    this.toast('전리품을 획득했다!', '💰');
    this.checkQuests();
    this.persist();
  }

  private spawnPirateAtBeach(near: { x: number; y: number }, kind: string) {
    const pts = this.island.beach.filter((p) => Math.hypot(p.x - near.x, p.y - near.y) > 260);
    const p = pts.length ? pts[Phaser.Math.Between(0, pts.length - 1)] : this.island.spawn;
    const u = new Unit(this.world, p.x, p.y, kind);
    this.addWorld(u);
    this.units.push(u);
    this.all.push(u);
    burst(this, p.x, p.y, 'fx_smoke', 12, { speed: { min: 20, max: 80 }, lifespan: 600, scale: { start: 0.7, end: 1.9 }, alpha: { start: 0.5, end: 0 } });
    return u;
  }

  // ============================================================
  // 퀘스트 / 수정 낙하 / 엔딩
  // ============================================================
  private questDone(id: string) {
    if (state.quests[id]) return;
    state.quests[id] = true;
    const q = QUESTS.find((x) => x.id === id);
    if (q) bus.emit(EV.QUEST, { id, text: q.text });
    play('level');
  }

  private checkQuests() {
    if (state.intro) this.questDone('q_shore');
    if (hasTool('axe2') && hasTool('pick2')) this.questDone('q_tool2');
    if (this.questFlags.grown4) this.questDone('q_grow');
    if (count('crystal') >= 3) this.questDone('q_crystal');
    if (this.questFlags.camp) this.questDone('q_camp');
    if (state.friday) this.questDone('q_friday');
    if (familyTier('wood') >= 3 || familyTier('stone') >= 3 || familyTier('oil') >= 3) this.questDone('q_tool3');
    if (this.questFlags.tower) this.questDone('q_tower');
    if (state.raidsWon >= 1) this.questDone('q_raid');
    if (state.raft >= RAFT_GOAL) this.questDone('q_raft');
    // 수정 결정 — 하루에 1개 (살아있는 결정이 없을 때만)
    if (state.crystalDay < state.day && state.intro) this.spawnCrystalNode();
  }

  /**
   * 하루에 1개, 섬 어딘가에 수정 결정이 나타난다.
   *  · 성장하지 않는다 (레벨 고정)
   *  · 캐내면 1 / 9 / 99 개가 나오고 그 자리에서 사라진다
   *  · 어디 있는지 알려주지 않는다 — 빛기둥과 미니맵 표시를 단서로 찾아간다
   */
  private spawnCrystalNode() {
    state.crystalDay = state.day;
    // 아직 안 캔 수정 결정이 남아 있으면 오늘은 나타나지 않는다
    if (this.nodes.some((n) => n.family === 'crystal' && !n.isDepleted)) return;

    // 플레이어에서 적당히 떨어진 땅을 찾는다
    let x = 0;
    let y = 0;
    let found = false;
    for (let tries = 0; tries < 240 && !found; tries++) {
      const a = Math.random() * Math.PI * 2;
      const d = Phaser.Math.Between(380, 1150);
      const tx = Phaser.Math.Clamp(this.player.x + Math.cos(a) * d, 96, WORLD_W - 96);
      const ty = Phaser.Math.Clamp(this.player.y + Math.sin(a) * d, 96, WORLD_H - 96);
      if (this.isLand(tx, ty)) { x = tx; y = ty; found = true; }
    }
    if (!found) {
      const s = this.island.nodes[Phaser.Math.Between(0, this.island.nodes.length - 1)];
      x = s.x;
      y = s.y;
    }
    x = Math.round(x);
    y = Math.round(y);

    state.extras.push(['crystal', x, y]);
    state.nodeLevel.push(1);
    state.nodeProg.push(0);
    const node = new ResourceNode(this, state.nodeLevel.length - 1, 'crystal', x, y, 1, 0);
    this.nodes.push(node);

    bus.emit(EV.BANNER, { title: '수정 결정이 나타났다', sub: '빛기둥을 찾아가자 (미니맵에 표시됨)', icon: '💎' });
    play('coin');
    flash(this, 0x8ff2ff, 0.16, 400);
    ring(this, x, y, 0x8ff2ff, 1.6, 700);
    burst(this, x, y - 12, 'fx_star', 14, { speed: { min: 30, max: 130 }, lifespan: 800, scale: { start: 1, end: 0 }, tint: 0x9fe8ff });

    const deg = (Math.atan2(y - this.player.y, x - this.player.x) * 180) / Math.PI;
    const dist = Math.round(Math.hypot(x - this.player.x, y - this.player.y) / 34);
    this.toast(`수정 결정: ${this.dirName(deg)}쪽 약 ${dist}걸음`, '💎');
  }

  /** 각도(도) → 방향 이름 (화면 기준: +y 가 남쪽) */
  private dirName(deg: number) {
    const names = ['동', '남동', '남', '남서', '서', '북서', '북', '북동'];
    return names[Math.round((((deg % 360) + 360) % 360) / 45) % 8];
  }

  private ending() {
    play('win');
    flash(this, 0xffffff, 0.5, 800);
    bus.emit(EV.MODAL, { type: 'ending', day: state.day, kills: state.kills, raids: state.raidsWon });
    this.questDone('q_raft');
  }

  // ============================================================
  // 유틸
  // ============================================================
  private toast(msg: string, icon?: string) { bus.emit(EV.TOAST, { msg, icon }); }

  private persist() {
    state.px = Math.round(this.player.x);
    state.py = Math.round(this.player.y);
    state.hp = Math.round(this.player.hp);
    state.buildings = this.buildings
      .filter((b) => b.alive && b.faction === 'player' && b.key !== 'chest' && b.key !== 'hut')
      .map((b) => ({ key: b.key, x: Math.round(b.x), y: Math.round(b.y), hp: Math.round(b.hp) }));
    for (const n of this.nodes) { state.nodeLevel[n.id] = n.level; state.nodeProg[n.id] = n.prog; }
    saveGame();
  }

  private shareBase() {
    // 기지 중심 기준 상대 좌표로 내보낸다 (친구 섬에 그대로 재현되도록)
    const n = Math.max(1, state.buildings.length);
    const cxTile = state.buildings.reduce((a, b) => a + b.x / TILE, 0) / n;
    const cyTile = state.buildings.reduce((a, b) => a + b.y / TILE, 0) / n;
    void encodeShareCode({
      v: 1,
      n: '나의 섬',
      p: estimatePower(state.nodeLevel, state.buildings.length, state.kills),
      b: state.buildings.map((b) => [
        b.key,
        Math.round(b.x / TILE - cxTile),
        Math.round(b.y / TILE - cyTile),
        Math.round(b.hp),
      ]),
      g: this.units
        .filter((u) => u.alive && u.faction === 'player')
        .map((u) => [u.key === 'friday' ? 'raider' : u.key, Math.round(u.x), Math.round(u.y)]),
    }).then((code) => {
      void navigator.clipboard?.writeText(code).catch(() => void 0);
      bus.emit(EV.MODAL, { type: 'share', code });
    });
  }

  /** 친구가 보낸 초대 코드 붙여넣기 → 그 섬을 약탈 대상으로 등록 */
  private async importCode() {
    const raw = typeof window !== 'undefined' ? window.prompt('친구에게 받은 초대 코드를 붙여넣으세요 (RSI1-...)') : null;
    if (!raw) return;
    const isl = await decodeShareCode(raw);
    if (!isl) { this.toast('코드가 올바르지 않습니다', '❌'); play('ui'); return; }
    rivals.code.push(isl);
    bus.emit(EV.MODAL_CLOSE);
    bus.emit(EV.BANNER, { title: `${isl.name} 섬을 발견!`, sub: '약탈 버튼으로 공략할 수 있습니다', icon: '📥' });
    play('coin');
  }

  private addUnit(u: Unit) {
    this.addWorld(u);
    this.units.push(u);
    this.all.push(u);
    return u;
  }
}
