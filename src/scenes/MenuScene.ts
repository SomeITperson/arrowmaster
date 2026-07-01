import Phaser from 'phaser';
import { GAME_WIDTH } from '@duels/shared';
import type { DuelSceneData } from './DuelScene';

/** Title screen: pick opponent (bot/online) and range (close/long). */
export class MenuScene extends Phaser.Scene {
  constructor() {
    super('Menu');
  }

  create(): void {
    this.cameras.main.setBackgroundColor('#10141c');

    this.add
      .text(GAME_WIDTH / 2, 150, 'DUELS', {
        fontFamily: 'monospace',
        fontSize: '88px',
        color: '#ffd479',
        fontStyle: 'bold',
      })
      .setOrigin(0.5);

    this.add
      .text(GAME_WIDTH / 2, 220, 'лучный дуэль 1 на 1', { fontFamily: 'monospace', fontSize: '22px', color: '#8fbfff' })
      .setOrigin(0.5);

    const y0 = 320;
    const dy = 86;
    this.button(y0 + dy * 0, 'БОТ — БЛИЖНИЙ БОЙ', 0x4caf50, { opponent: 'bot', mode: 'close' });
    this.button(y0 + dy * 1, 'БОТ — ДАЛЬНИЙ БОЙ', 0x3f9142, { opponent: 'bot', mode: 'long' });
    this.button(y0 + dy * 2, 'ПО СЕТИ — БЛИЖНИЙ', 0x4f8cff, { opponent: 'online', mode: 'close' });
    this.button(y0 + dy * 3, 'ПО СЕТИ — ДАЛЬНИЙ', 0x3f6fcc, { opponent: 'online', mode: 'long' });
  }

  private button(y: number, label: string, color: number, data: DuelSceneData): void {
    const w = 460;
    const h = 64;
    const x = GAME_WIDTH / 2;

    const bg = this.add.graphics();
    bg.fillStyle(color, 1);
    bg.fillRoundedRect(x - w / 2, y - h / 2, w, h, 12);

    const text = this.add
      .text(x, y, label, { fontFamily: 'monospace', fontSize: '26px', color: '#0d1018', fontStyle: 'bold' })
      .setOrigin(0.5);

    const zone = this.add.zone(x, y, w, h).setOrigin(0.5).setInteractive({ useHandCursor: true });
    zone.on('pointerover', () => text.setScale(1.06));
    zone.on('pointerout', () => text.setScale(1));
    zone.on('pointerdown', () => this.scene.start('Duel', data));
  }
}
