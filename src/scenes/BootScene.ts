import Phaser from 'phaser';
import { generateTextures, registerAnims } from '../boot/textures';

/**
 * Generates all runtime textures/animations, then opens the menu. When real art
 * is added, load it here (this.load.spritesheet/atlas/image) before create().
 */
export class BootScene extends Phaser.Scene {
  constructor() {
    super('Boot');
  }

  create(): void {
    generateTextures(this);
    registerAnims(this);
    this.scene.start('Menu');
  }
}
