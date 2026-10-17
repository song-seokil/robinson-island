import Phaser from 'phaser';
import { buildTextures } from '../art/textures';
import { initAudio, play } from '../core/sfx';
import { hasSave, loadSave, state } from '../core/state';

/**
 * 부트 — 모든 텍스처를 코드로 생성하고 게임 씬으로 넘긴다.
 * (에셋 파일이 없으므로 로딩이 사실상 즉시 끝난다)
 */
export const PRE_RENDERED_PROPS = [
  'n_tree', 'n_palm', 'n_bush', 'n_berry', 'n_rock', 'n_ore', 'n_crystal', 'n_tar',
  'b_campfire', 'b_wall', 'b_tower', 'b_spikes', 'b_hut', 'b_raft', 'b_chest',
  'u_player', 'u_sword', 'u_archer', 'u_bomber', 'u_boss', 'u_boar',
] as const;

/** 프리렌더된 섬 지도 — 시드별 PNG (없으면 게임이 절차적으로 그림을 그린다) */
export function islandMapKey(seed: number) { return `island_map_${seed}`; }

export class BootScene extends Phaser.Scene {
  constructor() { super('boot'); }

  /** Blender 3D 렌더 자산을 먼저 싣는다 (없으면 buildTextures 가 캔버스로 대신 그린다) */
  preload() {
    for (const key of PRE_RENDERED_PROPS) {
      this.load.image(key, `props/${key}.png`);
    }
    this.load.image(islandMapKey(824934), 'island/island_824934.png');
  }

  create() {
    this.cameras.main.setBackgroundColor(0x06131f);
    const title = this.add.text(640, 300, '무인도 생존기', {
      fontFamily: 'system-ui, "Malgun Gothic", sans-serif', fontSize: '46px', fontStyle: 'bold', color: '#eaf4ff',
    }).setOrigin(0.5);
    const sub = this.add.text(640, 352, '— Robinson Island —', {
      fontFamily: 'system-ui, sans-serif', fontSize: '18px', color: '#7fb0d6',
    }).setOrigin(0.5);
    const tip = this.add.text(640, 420, '화면을 터치하면 시작합니다', {
      fontFamily: 'system-ui, "Malgun Gothic", sans-serif', fontSize: '16px', color: '#9fc0dd',
    }).setOrigin(0.5);
    this.tweens.add({ targets: tip, alpha: 0.35, duration: 900, yoyo: true, repeat: -1 });

    buildTextures(this);

    const start = () => {
      initAudio();
      play('ui');
      const loaded = hasSave() && loadSave();
      if (!loaded) {
        // 새 섬: 매번 완전히 새로운 랜덤 섬
        state.seed = Math.floor(Math.random() * 1e9);
      }
      this.scene.start('island');
      void title; void sub;
    };

    this.input.once('pointerdown', start);
    this.input.keyboard?.once('keydown', start);
  }
}
