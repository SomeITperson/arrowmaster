import Phaser from 'phaser';
import { stepProjectile, type Field, type Weapon } from '@duels/shared';

/**
 * A single projectile in flight. Integration is delegated to the shared
 * stepProjectile() so the visible flight matches the server's authoritative
 * simulation exactly.
 */
export class Arrow {
  public alive = true;
  public readonly pos: Phaser.Math.Vector2;
  public readonly vel: Phaser.Math.Vector2;

  private readonly weapon: Weapon;
  private readonly img: Phaser.GameObjects.Image;

  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    vx: number,
    vy: number,
    weapon: Weapon,
    register?: (obj: Phaser.GameObjects.GameObject) => void,
  ) {
    this.pos = new Phaser.Math.Vector2(x, y);
    this.vel = new Phaser.Math.Vector2(vx, vy);
    this.weapon = weapon;

    this.img = scene.add
      .image(x, y, 'arrow')
      .setOrigin(0.9, 0.5)
      .setTint(weapon.color)
      .setRotation(Math.atan2(vy, vx))
      .setDepth(5);
    register?.(this.img);
  }

  update(dt: number, field: Field): void {
    if (!this.alive) return;
    // Phaser.Math.Vector2 is structurally a Vec2 ({ x, y }), so the shared
    // integrator mutates it directly.
    stepProjectile(this.pos, this.vel, this.weapon, field, dt);
    this.img.setPosition(this.pos.x, this.pos.y);
    this.img.setRotation(Math.atan2(this.vel.y, this.vel.x));
  }

  /** The arrowhead position used for collision tests. */
  get tip(): Phaser.Math.Vector2 {
    return this.pos;
  }

  /** Stop the arrow where it is and fade it out. */
  stick(scene: Phaser.Scene): void {
    this.alive = false;
    scene.tweens.add({
      targets: this.img,
      alpha: 0,
      delay: 350,
      duration: 250,
      onComplete: () => this.img.destroy(),
    });
  }

  destroy(): void {
    this.img.destroy();
  }
}
