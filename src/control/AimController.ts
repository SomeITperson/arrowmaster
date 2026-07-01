import Phaser from 'phaser';
import {
  GROUND_Y,
  MAX_DRAG,
  MIN_DRAG,
  bowAnchorFor,
  clampAimForward,
  predictPath,
  solutionFor,
  type AimInput,
  type Field,
  type FighterState,
  type Weapon,
} from '@duels/shared';

/** Fraction of the predicted path shown — about half the screen. */
const PREVIEW_FRACTION = 1 / 2;

export interface AimControllerOpts {
  onAim?: (angle: number, power: number) => void;
  register?: (obj: Phaser.GameObjects.GameObject) => void;
}

/**
 * Human shot provider (slingshot): pull back away from the target and release.
 * The camera keeps the fighter centred so there's room to draw. Angle is the
 * pull-back direction clamped into the forward firing cone; power is drag
 * length. Pointer coords are read through the main (world) camera so the
 * separate UI camera never skews them.
 */
export class AimController {
  private readonly scene: Phaser.Scene;
  private readonly state: FighterState;
  private readonly weapon: Weapon;
  private readonly field: Field;
  private readonly maxX: number;
  private readonly opts: AimControllerOpts;
  private readonly preview: Phaser.GameObjects.Graphics;

  private aiming = false;
  private lastStream = 0;
  private resolver?: (aim: AimInput) => void;
  /** World point where the current drag started (the touch-down point). */
  private startPoint = new Phaser.Math.Vector2();

  constructor(
    scene: Phaser.Scene,
    state: FighterState,
    weapon: Weapon,
    field: Field,
    maxX: number,
    opts: AimControllerOpts = {},
  ) {
    this.scene = scene;
    this.state = state;
    this.weapon = weapon;
    this.field = field;
    this.maxX = maxX;
    this.opts = opts;
    this.preview = scene.add.graphics().setDepth(8);
    opts.register?.(this.preview);
  }

  getShot(): Promise<AimInput> {
    return new Promise((resolve) => {
      this.resolver = resolve;
      this.scene.input.on('pointerdown', this.onDown, this);
      this.scene.input.on('pointermove', this.onMove, this);
      this.scene.input.on('pointerup', this.onUp, this);
    });
  }

  private aimFrom(pointer: Phaser.Input.Pointer): { angle: number; power: number; len: number } {
    const world = this.scene.cameras.main.getWorldPoint(pointer.x, pointer.y);
    const dx = this.startPoint.x - world.x; // pull-back measured from the touch point
    const dy = this.startPoint.y - world.y;
    const len = Math.hypot(dx, dy);
    return {
      angle: clampAimForward(this.state.side, Math.atan2(dy, dx)),
      power: Phaser.Math.Clamp(len, 0, MAX_DRAG) / MAX_DRAG,
      len,
    };
  }

  private onDown(pointer: Phaser.Input.Pointer): void {
    this.aiming = true;
    this.startPoint = this.scene.cameras.main.getWorldPoint(pointer.x, pointer.y);
    this.onMove(pointer);
  }

  private onMove(pointer: Phaser.Input.Pointer): void {
    if (!this.aiming) return;
    const { angle, power } = this.aimFrom(pointer);
    this.drawPreview(angle, power);

    const now = this.scene.time.now;
    if (this.opts.onAim && now - this.lastStream > 60) {
      this.lastStream = now;
      this.opts.onAim(angle, power);
    }
  }

  private onUp(pointer: Phaser.Input.Pointer): void {
    if (!this.aiming) return;
    const { angle, power, len } = this.aimFrom(pointer);
    if (len < MIN_DRAG) {
      this.aiming = false;
      this.preview.clear();
      return;
    }
    this.cleanup();
    this.resolver?.({ angle, power });
    this.resolver = undefined;
  }

  private drawPreview(angle: number, power: number): void {
    const a = bowAnchorFor(this.state);
    const sol = solutionFor({ angle, power }, this.weapon);
    const full = predictPath(a, { x: sol.vx, y: sol.vy }, this.weapon, this.field, GROUND_Y, this.maxX);
    const shown = Math.max(1, Math.floor(full.length * PREVIEW_FRACTION));

    const color = Phaser.Display.Color.GetColor(
      Math.floor(120 + 135 * power),
      Math.floor(220 - 150 * power),
      90,
    );
    this.preview.clear();
    this.preview.fillStyle(color, 1);
    for (let i = 0; i < shown; i++) {
      const pt = full[i]!;
      this.preview.fillCircle(pt.x, pt.y, 3 - (i / shown) * 1.4);
    }
  }

  private cleanup(): void {
    this.aiming = false;
    this.preview.clear();
    this.scene.input.off('pointerdown', this.onDown, this);
    this.scene.input.off('pointermove', this.onMove, this);
    this.scene.input.off('pointerup', this.onUp, this);
  }

  dispose(): void {
    this.cleanup();
    this.preview.destroy();
  }
}
