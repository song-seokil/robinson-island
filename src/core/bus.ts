import Phaser from 'phaser';

/**
 * 씬 간 이벤트 버스 (UIScene ↔ IslandScene).
 * 모든 페이로드는 여기에 정의해 두고 양쪽에서 동일하게 사용한다.
 */
export const bus = new Phaser.Events.EventEmitter();

export const EV = {
  // UI → 게임
  MOVE: 'move',                 // {x, y} 조이스틱/키 입력 벡터 (정규화 아님)
  ACTION: 'action',             // string: 'attack' | 'build' | 'craft' | 'raid' | 'menu' | 'reset'
  BUILD_PICK: 'build_pick',     // BuildId | null
  // 게임 → UI
  TOAST: 'toast',               // {msg, icon?}
  BANNER: 'banner',             // {title, sub?, color?, icon?}
  HUD: 'hud',                   // HudInfo
  HUD_REFRESH: 'hud_refresh',   // 즉시 갱신 요청
  QUEST: 'quest',               // {id, text}
  MODAL: 'modal',               // {type, ...}
  MODAL_CLOSE: 'modal_close',
  FLOAT: 'float',               // {x, y, text, color}  월드 좌표 획득 텍스트
  SFX: 'sfx',                   // string
  BUILD_MODE: 'build_mode',     // BuildId | null
  MISSILE: 'missile',           // {kind:'incoming'} 경보
} as const;

export interface HudInfo {
  hp: number; maxHp: number;
  day: number;
  dayT: number;          // 0..1
  night: boolean;
  raid: boolean;
  raidLabel: string;     // '' | '해적 상륙!' | '웨이브 2/3'
  inv: Record<string, number>;
  tools: Record<string, boolean>;
  raft: number;
  raftGoal: number;
  kills: number;
  raidsWon: number;
  mode: 'explore' | 'build';
  buildId: string | null;
  buildAffordable: boolean;
  fps: number;
  crystal: { x: number; y: number } | null;   // 살아있는 수정 결정 위치 (미니맵 표시용)
}
