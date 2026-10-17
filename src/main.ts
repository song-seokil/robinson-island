import Phaser from 'phaser';
import { BootScene } from './scenes/BootScene';
import { IslandScene } from './scenes/IslandScene';
import { UIScene } from './scenes/UIScene';
import { state } from './core/state';

/**
 * 무인도 생존기 (가칭) — Robinson Island
 *  · 2D 섬 생존 + 채집/성장 + 제작 + 약탈 방어/공략
 *  · Android / iOS 공용 (Capacitor 로 감싼다)
 */
const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  parent: 'app',
  backgroundColor: '#0a1a2a',
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
    width: 1280,
    height: 720,
  },
  render: {
    antialias: true,
    roundPixels: false,
    powerPreference: 'high-performance',
  },
  input: {
    activePointers: 4,
    touch: { capture: true },
  },
  fps: { target: 60, forceSetTimeOut: false },
  scene: [BootScene, IslandScene, UIScene],
};

export const game = new Phaser.Game(config);

// 개발용 디버그 훅 (배포 빌드에도 남지만 영향 없음 — 테스트 자동화에 사용)
(window as unknown as { __game?: Phaser.Game; __state?: typeof state }).__game = game;
(window as unknown as { __game?: Phaser.Game; __state?: typeof state }).__state = state;

// 모바일에서 길게 누르기 메뉴/스크롤 방지
if (typeof document !== 'undefined') {
  document.addEventListener('contextmenu', (e) => e.preventDefault());
  document.addEventListener(
    'touchmove',
    (e) => {
      if (e.touches.length > 0) e.preventDefault();
    },
    { passive: false },
  );
}
