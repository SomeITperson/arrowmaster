import Phaser from 'phaser';
import { GAME_HEIGHT, GAME_WIDTH } from '@duels/shared';

const D = Phaser.Math.DegToRad;

/**
 * Generates all placeholder textures procedurally so the game runs without art
 * files. Body parts are drawn in white so they can be tinted per side; real
 * spritesheets/atlases can replace these keys later without touching gameplay.
 */
export function generateTextures(scene: Phaser.Scene): void {
  const g = scene.add.graphics();
  const make = (key: string, w: number, h: number, draw: () => void): void => {
    if (scene.textures.exists(key)) return;
    g.clear();
    draw();
    g.generateTexture(key, w, h);
  };

  // --- Projectile & fx -------------------------------------------------
  make('arrow', 50, 11, () => {
    g.fillStyle(0xffffff, 1);
    g.fillRect(0, 4, 40, 3);
    g.fillTriangle(40, 1, 40, 10, 50, 5.5);
    g.fillTriangle(0, 0, 8, 5.5, 0, 11);
  });
  make('spark', 8, 8, () => {
    g.fillStyle(0xffffff, 1);
    g.fillCircle(4, 4, 4);
  });
  make('gib', 14, 12, () => {
    g.fillStyle(0xffffff, 1);
    g.fillCircle(5, 6, 5);
    g.fillCircle(9, 5, 4);
    g.fillCircle(8, 9, 3);
  });
  make('splat', 44, 30, () => {
    g.fillStyle(0xffffff, 1);
    for (const [x, y, r] of [
      [14, 16, 9],
      [24, 12, 6],
      [31, 19, 6],
      [18, 22, 4],
      [34, 11, 3],
      [8, 20, 3],
    ]) {
      g.fillCircle(x, y, r);
    }
  });

  // --- Body parts (white → tinted per side) ----------------------------
  make('legs', 40, 64, () => {
    g.fillStyle(0xffffff, 1);
    g.fillRoundedRect(4, 2, 14, 60, 5);
    g.fillRoundedRect(22, 2, 14, 60, 5);
  });
  make('legs_hurt', 40, 64, () => {
    g.fillStyle(0xffffff, 1);
    g.fillRoundedRect(4, 2, 14, 60, 5);
    g.fillRoundedRect(22, 2, 14, 36, 5); // lower-right leg torn off
    g.fillStyle(0x7a1414, 1);
    g.fillCircle(29, 38, 6);
  });

  const torso = (highlightY: number): void => {
    g.fillStyle(0xffffff, 1);
    g.fillRoundedRect(2, 2, 42, 70, 10);
    g.fillStyle(0xdddddd, 1);
    g.fillRect(7, highlightY, 30, 5);
    g.fillStyle(0x222a38, 1);
    g.fillRect(2, 62, 42, 8); // belt
  };
  make('torso_0', 46, 74, () => torso(13));
  make('torso_1', 46, 74, () => torso(17));
  make('torso_hurt', 46, 74, () => {
    g.fillStyle(0xffffff, 1);
    g.fillRoundedRect(2, 2, 42, 70, 10);
    g.fillStyle(0x7a1414, 1);
    g.fillCircle(24, 30, 10);
    g.fillStyle(0x4a0a0a, 1);
    g.fillCircle(24, 30, 5);
    g.fillStyle(0x222a38, 1);
    g.fillRect(2, 62, 42, 8);
  });

  make('head', 48, 48, () => {
    g.fillStyle(0xffffff, 1);
    g.fillCircle(24, 24, 22);
    g.fillStyle(0x101010, 1);
    g.fillCircle(33, 21, 3);
  });
  // A single limb segment (arm/leg) for the ragdoll — tinted + scaled per part.
  make('limb', 16, 40, () => {
    g.fillStyle(0xffffff, 1);
    g.fillRoundedRect(2, 2, 12, 36, 5);
  });
  make('head_hurt', 48, 48, () => {
    g.fillStyle(0xffffff, 1);
    g.fillCircle(24, 24, 22);
    g.fillStyle(0x7a1414, 1);
    g.fillCircle(17, 19, 5);
    g.fillStyle(0x101010, 1);
    g.fillCircle(33, 21, 3);
  });

  // --- Weapon (not tinted) ---------------------------------------------
  make('bow', 60, 64, () => {
    g.lineStyle(5, 0x8a5a2b, 1);
    g.beginPath();
    g.arc(8, 32, 28, D(-72), D(72), false);
    g.strokePath();
    const tx = 8 + 28 * Math.cos(D(-72));
    const ty1 = 32 + 28 * Math.sin(D(-72));
    const ty2 = 32 + 28 * Math.sin(D(72));
    g.lineStyle(1.5, 0xdddddd, 1);
    g.beginPath();
    g.moveTo(tx, ty1);
    g.lineTo(tx, ty2);
    g.strokePath();
  });

  // --- Backgrounds ------------------------------------------------------
  make('bg-dusk', GAME_WIDTH, GAME_HEIGHT, () => {
    g.fillGradientStyle(0x2a3a5a, 0x2a3a5a, 0x101a30, 0x101a30, 1);
    g.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);
    g.fillStyle(0xffb36b, 0.9);
    g.fillCircle(1000, 190, 70);
    g.fillStyle(0x16243e, 1);
    g.fillRoundedRect(-60, 500, GAME_WIDTH + 120, 320, 0);
  });
  make('bg-forest', GAME_WIDTH, GAME_HEIGHT, () => {
    g.fillGradientStyle(0x1d3326, 0x1d3326, 0x0d1a12, 0x0d1a12, 1);
    g.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);
    g.fillStyle(0x14241a, 1);
    for (let x = 40; x < GAME_WIDTH; x += 150) {
      g.fillTriangle(x - 55, 560, x + 55, 560, x, 300 + ((x * 7) % 120));
    }
  });

  g.destroy();
}

/** Registers shared animations (demonstrates the per-part frame pipeline). */
export function registerAnims(scene: Phaser.Scene): void {
  if (!scene.anims.exists('torso-idle')) {
    scene.anims.create({
      key: 'torso-idle',
      frames: [{ key: 'torso_0' }, { key: 'torso_1' }],
      frameRate: 1.6,
      yoyo: true,
      repeat: -1,
    });
  }
}
