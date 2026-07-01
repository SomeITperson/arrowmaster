import Phaser from 'phaser';
import {
  BOW,
  GAME_HEIGHT,
  GAME_WIDTH,
  GROUND_Y,
  aimElevation,
  bowAnchorFor,
  opposite,
  solutionFor,
  type AimInput,
  type Arena,
  type BodyPart,
  type Field,
  type Side,
} from '@duels/shared';
import { Arrow } from '../objects/Arrow';
import { Fighter } from '../objects/Fighter';

export interface ShotOutcome {
  hit: { part: BodyPart; x: number; y: number; damage: number } | null;
  hpLeft: number;
  hpRight: number;
  /** Authoritative fighter X after the shot (shifts on knockback). */
  leftX: number;
  rightX: number;
}

const SIDE_COLOR: Record<Side, number> = { left: 0x4f8cff, right: 0xff5a5a };
const PART_LABEL: Record<BodyPart, string> = { head: 'В ГОЛОВУ!', torso: 'торс', legs: 'ноги' };
const IMPULSE: Record<BodyPart, number> = { head: 150, torso: 90, legs: 55 };

/** Optional gameplay-camera zoom. 1 = no zoom; raise to close in on fighters. */
const CAMERA_ZOOM = 1;
const CAM_MARGIN = 480;

/**
 * All on-screen rendering for a duel. Two cameras: the main (world) camera
 * centres on the active fighter and follows the arrow; a separate UI camera
 * renders the HUD so it never zooms or scrolls. Objects are registered to the
 * UI camera's ignore list via `registerWorld` so they only show in the world.
 */
export class DuelView {
  private readonly scene: Phaser.Scene;
  private readonly arena: Arena;
  private readonly field: Field;
  private readonly mySide: Side;
  private readonly fighters: Record<Side, Fighter>;
  private readonly readout: Phaser.GameObjects.Text;

  private mainCam!: Phaser.Cameras.Scene2D.Camera;
  private uiCam!: Phaser.Cameras.Scene2D.Camera;

  private hudGfx!: Phaser.GameObjects.Graphics;
  private turnText!: Phaser.GameObjects.Text;
  private distanceText!: Phaser.GameObjects.Text;

  private arrow?: Arrow;
  private arrowTarget?: Side;
  private pendingOutcome?: ShotOutcome;
  private arrowResolve?: () => void;

  constructor(scene: Phaser.Scene, mySide: Side, arena: Arena, bgKey: string) {
    this.scene = scene;
    this.arena = arena;
    this.field = { wind: arena.wind };
    this.mySide = mySide;

    this.setupCameras();
    this.createGround();
    this.drawBackground(bgKey);
    this.drawScenery();
    this.fighters = {
      left: new Fighter(scene, 'left', SIDE_COLOR.left, arena.left, this.registerWorld),
      right: new Fighter(scene, 'right', SIDE_COLOR.right, arena.right, this.registerWorld),
    };
    // Readout only ever shown for the local player (opponent numbers stay hidden).
    this.readout = this.world(
      scene.add
        .text(bowAnchorFor(this.fighters[mySide].state).x, this.fighters[mySide].baseY - 196, '', {
          fontFamily: 'monospace',
          fontSize: '20px',
          color: '#ffffff',
          backgroundColor: '#00000066',
          padding: { x: 6, y: 2 },
        })
        .setOrigin(0.5)
        .setDepth(12)
        .setVisible(false),
    );
    this.createHud(arena.wind, mySide);
    this.focusShooter('left');
  }

  fighter(side: Side): Fighter {
    return this.fighters[side];
  }

  // --- Cameras ------------------------------------------------------------

  private setupCameras(): void {
    this.mainCam = this.scene.cameras.main;
    this.mainCam.setBounds(-CAM_MARGIN, -260, this.arena.width + CAM_MARGIN * 2, GAME_HEIGHT + 320);
    this.mainCam.setZoom(CAMERA_ZOOM);

    this.uiCam = this.scene.cameras.add(0, 0, GAME_WIDTH, GAME_HEIGHT);
    this.uiCam.setScroll(0, 0);
  }

  /** Static floor the ragdoll bodies land on (its top sits at GROUND_Y). */
  private createGround(): void {
    this.scene.matter.add.rectangle(this.arena.width / 2, GROUND_Y + 40, this.arena.width + 1400, 80, {
      isStatic: true,
      friction: 0.9,
    });
  }

  /** Register a world object so the UI camera ignores it. */
  registerWorld = (obj: Phaser.GameObjects.GameObject): void => {
    this.uiCam.ignore(obj);
  };

  private world<T extends Phaser.GameObjects.GameObject>(obj: T): T {
    this.uiCam.ignore(obj);
    return obj;
  }

  private ui<T extends Phaser.GameObjects.GameObject>(obj: T): T {
    this.mainCam.ignore(obj);
    return obj;
  }

  /** Centre the world camera on a fighter (with room to draw the slingshot). */
  focusShooter(side: Side): void {
    const f = this.fighters[side];
    this.mainCam.panEffect.reset();
    this.mainCam.pan(f.baseX, f.baseY - 150, 360, 'Sine.easeInOut');
  }

  private focusArena(): void {
    const cx = (this.arena.left.x + this.arena.right.x) / 2;
    const span = Math.abs(this.arena.right.x - this.arena.left.x) + 420;
    this.mainCam.pan(cx, GROUND_Y - 150, 400, 'Sine.easeInOut');
    this.mainCam.zoomTo(Math.min(CAMERA_ZOOM, GAME_WIDTH / span), 400);
  }

  // --- Live aim -----------------------------------------------------------

  onAim(side: Side, angle: number, power: number): void {
    this.fighters[side].setAim(angle, power);
    if (side !== this.mySide) return; // opponent's power/angle stays hidden
    const f = this.fighters[side];
    const elevDeg = -Math.round((aimElevation(side, angle) * 180) / Math.PI);
    const arrow = elevDeg >= 0 ? '↑' : '↓';
    this.readout
      .setPosition(bowAnchorFor(f.state).x, f.baseY - 196)
      .setText(`${Math.round(power * 100)}%  ${arrow}${Math.abs(elevDeg)}°`)
      .setVisible(true);
  }

  hideAim(side: Side): void {
    this.fighters[side].resetAim();
    if (side === this.mySide) this.readout.setVisible(false);
  }

  hideAllAims(): void {
    this.hideAim('left');
    this.hideAim('right');
  }

  // --- Arrow flight + settle ---------------------------------------------

  update(deltaMs: number): void {
    const arrow = this.arrow;
    if (!arrow || !arrow.alive) return;

    const dt = Math.min(deltaMs, 34) / 1000;
    arrow.update(dt, this.field);
    const tip = arrow.tip;
    this.mainCam.centerOn(tip.x, tip.y); // follow the projectile

    const target = this.arrowTarget ? this.fighters[this.arrowTarget] : undefined;
    const part = target?.hitTest(tip) ?? null;

    if (part || tip.y >= GROUND_Y || tip.x < -120 || tip.x > this.arena.width + 120 || tip.y > GAME_HEIGHT + 120) {
      this.finishArrow();
    }
  }

  playShot(shooter: Side, aim: AimInput, outcome: ShotOutcome): Promise<void> {
    return new Promise((resolve) => {
      const a = bowAnchorFor(this.fighters[shooter].state);
      const sol = solutionFor(aim, BOW);
      this.mainCam.panEffect.reset();
      this.arrow = new Arrow(this.scene, a.x, a.y, sol.vx, sol.vy, BOW, this.registerWorld);
      this.arrowTarget = opposite(shooter);
      this.pendingOutcome = outcome;
      this.arrowResolve = resolve;
    });
  }

  private finishArrow(): void {
    const outcome = this.pendingOutcome;
    const arrow = this.arrow;
    const resolve = this.arrowResolve;
    const targetSide = this.arrowTarget;
    if (!arrow || !outcome || !targetSide) return;

    this.arrow = undefined;
    this.arrowTarget = undefined;
    this.pendingOutcome = undefined;
    this.arrowResolve = undefined;

    if (outcome.hit) {
      // Stick the arrow into the body — it stays embedded and never removed.
      const ang = Math.atan2(arrow.vel.y, arrow.vel.x);
      this.fighters[targetSide].embedArrow(outcome.hit.x, outcome.hit.y, ang);
      arrow.destroy();
    } else {
      arrow.stick(this.scene); // miss: lodge in the ground and fade
    }

    void this.settle(outcome, targetSide, resolve);
  }

  private async settle(outcome: ShotOutcome, targetSide: Side, resolve?: () => void): Promise<void> {
    this.fighters.left.setHp(outcome.hpLeft);
    this.fighters.right.setHp(outcome.hpRight);
    this.updateHud();

    if (outcome.hit) {
      const { x, y, part, damage } = outcome.hit;
      const dirX = targetSide === 'right' ? 1 : -1;
      this.bloodFx(x, y, part, dirX);
      this.fighters[targetSide].damagePart(part, x, y);
      this.floatDamage(x, y, damage, part);
      this.mainCam.shake(160, part === 'head' ? 0.016 : 0.008);

      const lethal = (targetSide === 'left' ? outcome.hpLeft : outcome.hpRight) <= 0;
      const impulse = IMPULSE[part] + damage * 0.6;
      const targetX = targetSide === 'left' ? outcome.leftX : outcome.rightX;
      await this.fighters[targetSide].applyHit(impulse, dirX, lethal, targetX); // turn waits for ragdoll
    } else {
      await this.delay(450);
    }
    this.updateHud(); // refresh distance after any relocation
    resolve?.();
  }

  // --- Background, scenery, terrain --------------------------------------

  private drawBackground(bgKey: string): void {
    const w = this.arena.width + CAM_MARGIN * 2 + 200;
    if (this.scene.textures.exists(bgKey)) {
      this.world(
        this.scene.add
          .image(this.arena.width / 2, GAME_HEIGHT / 2, bgKey)
          .setDisplaySize(w, GAME_HEIGHT + 320)
          .setDepth(-10),
      );
    } else {
      this.world(
        this.scene.add
          .graphics()
          .setDepth(-10)
          .fillGradientStyle(0x1b2536, 0x1b2536, 0x10141c, 0x10141c, 1)
          .fillRect(-CAM_MARGIN, -260, w, GAME_HEIGHT + 320),
      );
    }
  }

  private drawScenery(): void {
    const left = -CAM_MARGIN;
    const w = this.arena.width + CAM_MARGIN * 2;

    const ground = this.scene.add.graphics().setDepth(-5);
    ground.fillStyle(0x232c1c, 1);
    ground.fillRect(left, GROUND_Y, w, GAME_HEIGHT - GROUND_Y + 260);
    ground.fillStyle(0x2e3a24, 1);
    ground.fillRect(left, GROUND_Y, w, 6);
    // Terrain hill under a raised fighter (long mode).
    for (const s of [this.arena.left, this.arena.right]) {
      if (s.y < GROUND_Y - 4) {
        ground.fillStyle(0x283420, 1);
        ground.fillTriangle(s.x - 260, GROUND_Y, s.x + 260, GROUND_Y, s.x, s.y - 16);
      }
    }
    this.world(ground);

    const plat = this.scene.add.graphics().setDepth(-4);
    plat.fillStyle(0x3a2f24, 1);
    for (const s of [this.arena.left, this.arena.right]) {
      plat.fillRoundedRect(s.x - 70, s.y - 4, 140, 26, 6);
    }
    this.world(plat);
  }

  // --- HUD (UI camera) ----------------------------------------------------

  setTurn(text: string, color: string): void {
    this.turnText.setText(text).setColor(color);
  }

  private createHud(wind: number, mySide: Side): void {
    this.hudGfx = this.ui(this.scene.add.graphics().setDepth(10));

    this.turnText = this.ui(
      this.scene.add
        .text(GAME_WIDTH / 2, 140, '', { fontFamily: 'monospace', fontSize: '24px', color: '#ffffff' })
        .setOrigin(0.5)
        .setDepth(10),
    );

    const dir = wind >= 0 ? '→' : '←';
    this.ui(
      this.scene.add
        .text(GAME_WIDTH / 2, 172, `Ветер ${dir} ${Math.abs(wind)}`, {
          fontFamily: 'monospace',
          fontSize: '16px',
          color: '#8fbfff',
        })
        .setOrigin(0.5)
        .setDepth(10),
    );

    this.distanceText = this.ui(
      this.scene.add
        .text(GAME_WIDTH / 2, 196, '', { fontFamily: 'monospace', fontSize: '16px', color: '#cfd8e6' })
        .setOrigin(0.5)
        .setDepth(10),
    );

    const myLabelX = mySide === 'left' ? 44 : GAME_WIDTH - 44;
    this.ui(
      this.scene.add
        .text(myLabelX, 74, 'ТЫ', { fontFamily: 'monospace', fontSize: '16px', color: '#ffffff' })
        .setOrigin(mySide === 'left' ? 0 : 1, 0.5)
        .setDepth(10),
    );

    this.updateHud();
  }

  updateHud(): void {
    const g = this.hudGfx;
    g.clear();
    this.drawHpBar(g, 44, 96, this.fighters.left.hp / this.fighters.left.maxHp, false);
    this.drawHpBar(g, GAME_WIDTH - 44 - 360, 96, this.fighters.right.hp / this.fighters.right.maxHp, true);

    const distance = Math.round(Math.abs(this.fighters.right.baseX - this.fighters.left.baseX));
    this.distanceText.setText(`До противника: ${distance}`);
  }

  private drawHpBar(g: Phaser.GameObjects.Graphics, x: number, y: number, frac: number, rightAlign: boolean): void {
    const w = 360;
    const h = 22;
    g.fillStyle(0x000000, 0.45);
    g.fillRoundedRect(x - 3, y - 3, w + 6, h + 6, 6);
    g.fillStyle(0x2a2a2a, 1);
    g.fillRoundedRect(x, y, w, h, 5);
    const fillW = Math.max(0, w * frac);
    const color = frac > 0.5 ? 0x4caf50 : frac > 0.25 ? 0xffb300 : 0xe53935;
    g.fillStyle(color, 1);
    if (rightAlign) g.fillRoundedRect(x + (w - fillW), y, fillW, h, 5);
    else g.fillRoundedRect(x, y, fillW, h, 5);
  }

  // --- FX -----------------------------------------------------------------

  private bloodFx(x: number, y: number, part: BodyPart, dirX: number): void {
    const base = dirX > 0 ? 0 : 180;
    const spray = this.scene.add.particles(x, y, 'spark', {
      speed: { min: 90, max: 380 },
      angle: { min: base - 55, max: base + 55 },
      gravityY: 900,
      lifespan: { min: 700, max: 1500 },
      quantity: 1,
      scale: { start: 1.5, end: 0.7 },
      alpha: { start: 1, end: 0.3 },
      color: [0xff2a2a, 0xaa0000, 0x550000],
      bounds: { x: -CAM_MARGIN, y: -260, width: this.arena.width + CAM_MARGIN * 2, height: GROUND_Y + 260 },
      collideBottom: true,
      bounce: 0.15,
      emitting: false,
    });
    spray.setDepth(7);
    this.world(spray);
    spray.explode(part === 'head' ? 30 : 18, x, y);
    this.scene.time.delayedCall(1700, () => spray.destroy());

    // Blood pooling on the ground beneath the hit.
    for (let i = 0; i < 3; i++) {
      const splat = this.world(
        this.scene.add
          .image(x + Phaser.Math.Between(-40, 40), GROUND_Y - 2, 'splat')
          .setTint(0x8a0d0d)
          .setDepth(-3)
          .setAngle(Phaser.Math.Between(0, 360))
          .setScale(Phaser.Math.FloatBetween(0.7, 1.4)),
      );
      this.scene.tweens.add({ targets: splat, alpha: 0, delay: 3000, duration: 3000, onComplete: () => splat.destroy() });
    }
  }

  private floatDamage(x: number, y: number, dmg: number, part: BodyPart): void {
    const crit = part === 'head';
    const label = this.world(
      this.scene.add
        .text(x, y - 20, `-${dmg}  ${PART_LABEL[part]}`, {
          fontFamily: 'monospace',
          fontSize: crit ? '30px' : '22px',
          color: crit ? '#ff4455' : '#ffd479',
          fontStyle: 'bold',
        })
        .setOrigin(0.5)
        .setDepth(11),
    );
    this.scene.tweens.add({
      targets: label,
      y: y - 80,
      alpha: 0,
      duration: 900,
      ease: 'Quad.easeOut',
      onComplete: () => label.destroy(),
    });
  }

  showResult(playerWon: boolean, hint: string, onRestart: () => void): void {
    this.focusArena();
    this.ui(this.scene.add.graphics().setDepth(20).fillStyle(0x000000, 0.55).fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT));

    this.ui(
      this.scene.add
        .text(GAME_WIDTH / 2, GAME_HEIGHT / 2 - 30, playerWon ? 'ПОБЕДА' : 'ПОРАЖЕНИЕ', {
          fontFamily: 'monospace',
          fontSize: '64px',
          color: playerWon ? '#9fe6a0' : '#ff6b6b',
          fontStyle: 'bold',
        })
        .setOrigin(0.5)
        .setDepth(21),
    );
    this.ui(
      this.scene.add
        .text(GAME_WIDTH / 2, GAME_HEIGHT / 2 + 40, hint, { fontFamily: 'monospace', fontSize: '22px', color: '#dddddd' })
        .setOrigin(0.5)
        .setDepth(21),
    );

    this.scene.time.delayedCall(600, () => this.scene.input.once('pointerdown', onRestart));
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => this.scene.time.delayedCall(ms, resolve));
  }
}
