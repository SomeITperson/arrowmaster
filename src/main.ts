import Phaser from 'phaser';
import { GAME_HEIGHT, GAME_WIDTH } from '@duels/shared';
import { BootScene } from './scenes/BootScene';
import { MenuScene } from './scenes/MenuScene';
import { DuelScene } from './scenes/DuelScene';
import { initTelegram } from './telegram';

initTelegram();

// All gameplay physics is custom and lives in @duels/shared (run identically on
// the client and the authoritative server), so no Phaser physics system here.
const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  parent: 'game',
  width: GAME_WIDTH,
  height: GAME_HEIGHT,
  backgroundColor: '#10141c',
  scale: {
    // ENVELOP covers the whole window (full width on wide landscape phones),
    // cropping a little vertically. The HUD sits in a vertical safe band so it
    // is never clipped. The 1280×720 world stays fixed for server determinism.
    mode: Phaser.Scale.ENVELOP,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  // Matter is used ONLY for the hit ragdoll (projectiles/fighters stay custom).
  physics: {
    default: 'matter',
    matter: { gravity: { x: 0, y: 1 }, enableSleeping: true },
  },
  scene: [BootScene, MenuScene, DuelScene],
};

export default new Phaser.Game(config);
