import Phaser from 'phaser';
import {
  HITBOX,
  MAX_HP,
  aimElevation,
  facingOf,
  hitTestFighter,
  type BodyPart,
  type FighterState,
  type Side,
  type Spawn,
  type Vec2,
} from '@duels/shared';
import { Ragdoll } from './Ragdoll';

const BOW_X = 52; // bow hand reach (matches the shared bow anchor offset)
const HIP_Y = -64;
const ARM_L1 = 28; // upper-arm segment length
const ARM_L2 = 28; // forearm segment length
const FRONT_BEND = 1; // bow-arm elbow direction (flip if it points the wrong way)
const BACK_BEND = -1; // draw-arm elbow direction
/** Impulse above which the fighter is knocked off its feet (vs just recoiling). */
const FALL_IMPULSE = 150;

type Register = (obj: Phaser.GameObjects.GameObject) => void;

/** One articulated leg: a hip container with a knee sub-container (shin). */
interface Leg {
  hip: Phaser.GameObjects.Container;
  knee: Phaser.GameObjects.Container;
}

/** One articulated arm: a shoulder container with an elbow sub-container. */
interface Arm {
  shoulder: Phaser.GameObjects.Container;
  elbow: Phaser.GameObjects.Container;
}

/**
 * A part-based archer. Legs are articulated (thigh + shin with a knee joint) and
 * bend with draw power; the body and the bow anchor stay fixed so the trajectory
 * always originates from the same point. On a strong hit it hands off to a Matter
 * ragdoll, then kips back up onto its feet at the authoritative landing spot.
 */
export class Fighter {
  public hp = MAX_HP;
  public readonly maxHp = MAX_HP;
  public readonly side: Side;
  /** Mutable: shifts when knocked back, so the fighter stands where it lands. */
  public baseX: number;
  public readonly baseY: number;
  public alive = true;

  private readonly scene: Phaser.Scene;
  private readonly facing: 1 | -1;
  private readonly register: Register;
  private readonly skin: number;
  private readonly container: Phaser.GameObjects.Container;
  private readonly torso: Phaser.GameObjects.Sprite;
  private readonly head: Phaser.GameObjects.Sprite;
  private readonly aimPivot: Phaser.GameObjects.Container;
  private readonly nock: Phaser.GameObjects.Image;
  private readonly frontArm: Arm;
  private readonly backArm: Arm;
  private readonly legL: Leg;
  private readonly legR: Leg;
  private readonly legSprites: Phaser.GameObjects.Sprite[] = [];
  private readonly embedded: Phaser.GameObjects.Image[] = [];
  private readonly damaged = new Set<BodyPart>();

  constructor(scene: Phaser.Scene, side: Side, skinColor: number, spawn: Spawn, register: Register) {
    this.scene = scene;
    this.side = side;
    this.baseX = spawn.x;
    this.baseY = spawn.y;
    this.facing = facingOf(side);
    this.register = register;
    this.skin = skinColor;

    this.container = scene.add.container(this.baseX, this.baseY).setDepth(3);
    this.container.scaleX = this.facing;

    this.legL = this.makeLeg(-9, skinColor);
    this.legR = this.makeLeg(9, skinColor);

    this.torso = scene.add.sprite(HITBOX.torso.x, HITBOX.torso.y, 'torso_0').setTint(skinColor);
    this.head = scene.add.sprite(HITBOX.head.x, HITBOX.head.y, 'head').setTint(skinColor);
    this.torso.play('torso-idle');

    this.aimPivot = scene.add.container(0, -112);
    // Both arms are articulated limbs (upper + forearm via an elbow), like the
    // legs, so each segment is its own sprite that can later wear a texture.
    this.backArm = this.makeArm(0x6E4B1F); // draw arm (drawn behind the bow) // 0x2a3340
    const bow = scene.add.image(BOW_X, 0, 'bow').setOrigin(0.2, 0.5);
    this.frontArm = this.makeArm(0xB0814E); // bow arm (in front)
    // Origin at the tail so the arrow rests on the string pointing forward (+x).
    this.nock = scene.add.image(BOW_X, 0, 'arrow').setOrigin(0, 0.5).setVisible(false);
    this.aimPivot.add([this.backArm.shoulder, bow, this.frontArm.shoulder, this.nock]);

    // Front hand holds the bow; back hand rests at the string until drawn.
    this.poseArm(this.frontArm, BOW_X, 0, FRONT_BEND);
    this.poseArm(this.backArm, BOW_X, 0, BACK_BEND);

    this.container.add([this.legL.hip, this.legR.hip, this.torso, this.head, this.aimPivot]);
    register(this.container);
  }

  private makeArm(skin: number): Arm {
    const shoulder = this.scene.add.container(0, 0);
    const upper = this.scene.add.sprite(ARM_L1 / 2, 0, 'limb').setDisplaySize(ARM_L1, 12).setTint(skin);
    const elbow = this.scene.add.container(ARM_L1, 0);
    const fore = this.scene.add.sprite(ARM_L2 / 2, 0, 'limb').setDisplaySize(ARM_L2, 11).setTint(skin);
    elbow.add(fore);
    shoulder.add([upper, elbow]);
    return { shoulder, elbow };
  }

  /** 2-bone IK: bend the arm so the hand reaches (tx, ty) in pivot space. */
  private poseArm(arm: Arm, tx: number, ty: number, bend: number): void {
    const d = Phaser.Math.Clamp(Math.hypot(tx, ty), Math.abs(ARM_L1 - ARM_L2) + 0.01, ARM_L1 + ARM_L2 - 0.01);
    const baseAngle = Math.atan2(ty, tx);
    const cosShoulder = Phaser.Math.Clamp((d * d + ARM_L1 * ARM_L1 - ARM_L2 * ARM_L2) / (2 * d * ARM_L1), -1, 1);
    const cosElbow = Phaser.Math.Clamp((ARM_L1 * ARM_L1 + ARM_L2 * ARM_L2 - d * d) / (2 * ARM_L1 * ARM_L2), -1, 1);
    arm.shoulder.setRotation(baseAngle - bend * Math.acos(cosShoulder));
    arm.elbow.setRotation(bend * (Math.PI - Math.acos(cosElbow)));
  }

  private makeLeg(xOffset: number, skin: number): Leg {
    const hip = this.scene.add.container(xOffset, HIP_Y);
    const thigh = this.scene.add.sprite(0, 16, 'limb').setDisplaySize(14, 34).setTint(skin);
    const knee = this.scene.add.container(0, 32);
    const shin = this.scene.add.sprite(0, 16, 'limb').setDisplaySize(12, 32).setTint(skin);
    knee.add(shin);
    hip.add([thigh, knee]);
    this.legSprites.push(thigh, shin);
    return { hip, knee };
  }

  get state(): FighterState {
    return { side: this.side, baseX: this.baseX, baseY: this.baseY };
  }

  hitTest(point: Vec2): BodyPart | null {
    if (!this.alive) return null;
    return hitTestFighter(this.state, point);
  }

  /** Embed an arrow into the body at a world point — it stays stuck and moves
   * with the fighter (kept, never removed). */
  embedArrow(worldX: number, worldY: number, worldAngle: number): void {
    const m = this.container.getWorldTransformMatrix();
    const local = new Phaser.Math.Vector2();
    m.applyInverse(worldX, worldY, local);
    const localAngle = this.facing === 1 ? worldAngle : Math.PI - worldAngle;
    const img = this.scene.add
      .image(local.x, local.y, 'arrow')
      .setOrigin(0.9, 0.5)
      .setRotation(localAngle)
      .setTint(0xffd479)
      .setDepth(4);
    this.container.add(img);
    this.embedded.push(img);
  }

  /**
   * Aim: rotate the bow to `angle` and bend the knees with draw `power`. The hip
   * (and therefore the body + bow anchor) stays put, so the trajectory origin
   * never moves.
   */
  setAim(angle: number, power: number): void {
    if (!this.alive) return;
    const d = aimElevation(this.side, angle);
    this.aimPivot.setRotation(d);

    const bend = Phaser.Math.Clamp(power, 0, 1);
    this.legL.knee.setRotation(bend * 0.55);
    this.legR.knee.setRotation(bend * 0.55);
    this.legL.hip.setRotation(bend * 0.2);
    this.legR.hip.setRotation(-bend * 0.12);

    // Crouch: drop the torso/head as the knees bend.
    const crouch = bend * 12;
    this.torso.setY(HITBOX.torso.y + crouch);
    this.head.setY(HITBOX.head.y + crouch);

    const nockX = BOW_X - (6 + bend * 22);
    this.nock.setVisible(true).setPosition(nockX, 0);
    this.poseArm(this.backArm, nockX, 0, BACK_BEND); // draw hand follows the string
  }

  resetAim(): void {
    this.aimPivot.setRotation(0);
    this.nock.setVisible(false);
    this.poseArm(this.backArm, BOW_X, 0, BACK_BEND); // hand back to the bow at rest
    this.scene.tweens.add({ targets: this.torso, y: HITBOX.torso.y, duration: 160, ease: 'Sine.easeOut' });
    this.scene.tweens.add({ targets: this.head, y: HITBOX.head.y, duration: 160, ease: 'Sine.easeOut' });
    for (const leg of [this.legL, this.legR]) {
      this.scene.tweens.add({ targets: leg.knee, rotation: 0, duration: 160, ease: 'Sine.easeOut' });
      this.scene.tweens.add({ targets: leg.hip, rotation: 0, duration: 160, ease: 'Sine.easeOut' });
    }
  }

  setHp(hp: number): void {
    this.hp = hp;
  }

  damagePart(part: BodyPart, worldX: number, worldY: number): void {
    if (!this.damaged.has(part)) {
      this.damaged.add(part);
      if (part === 'head') this.head.setTexture('head_hurt');
      else if (part === 'legs') for (const s of this.legSprites) s.setTint(0x6e2a2a);
      else {
        this.torso.anims.stop();
        this.torso.setTexture('torso_hurt');
      }
    }
    this.spewGibs(worldX, worldY, part === 'head' ? 7 : 5);
  }

  applyHit(impulse: number, dirX: number, lethal: boolean, targetX: number): Promise<void> {
    return new Promise((resolve) => {
      if (!this.alive && !lethal) {
        resolve();
        return;
      }
      if (lethal) this.alive = false;

      const willFall = lethal || impulse >= FALL_IMPULSE;
      this.setLimp(true);

      if (!willFall) {
        this.scene.tweens.add({
          targets: this.container,
          x: targetX,
          angle: dirX * 8,
          duration: 320,
          ease: 'Quint.easeOut',
          onComplete: () => {
            this.baseX = targetX;
            this.setLimp(false);
            this.scene.tweens.add({ targets: this.container, angle: 0, duration: 200, onComplete: () => resolve() });
          },
        });
        return;
      }

      // Strong/lethal: hand off to a Matter ragdoll, then kip back up.
      this.container.setVisible(false);
      this.resetAim();
      const dist = Math.abs(targetX - this.baseX);
      const vx = dirX * Phaser.Math.Clamp(dist / 24, 2, 11);
      const vy = 5 + impulse / 26;
      const ragdoll = new Ragdoll(this.scene, this.baseX, this.baseY, this.skin, vx, vy, this.register);

      this.scene.time.delayedCall(lethal ? 2300 : 1900, () => {
        this.baseX = targetX;
        if (lethal) {
          resolve(); // leave the ragdoll lying as the corpse
          return;
        }
        ragdoll.destroy();
        this.kipUp(targetX, dirX, resolve);
      });
    });
  }

  /** Spring up from prone onto the feet with a little jump. */
  private kipUp(x: number, dirX: number, resolve: () => void): void {
    this.setLimp(false);
    this.legL.knee.setRotation(0);
    this.legR.knee.setRotation(0);
    this.legL.hip.setRotation(0);
    this.legR.hip.setRotation(0);
    this.container.setPosition(x, this.baseY).setAngle(dirX * 70).setVisible(true);
    this.scene.tweens.add({ targets: this.container, angle: 0, duration: 380, ease: 'Back.easeOut' });
    this.scene.tweens.add({
      targets: this.container,
      y: this.baseY - 46,
      duration: 200,
      yoyo: true,
      ease: 'Quad.easeOut',
      onComplete: () => {
        this.container.setY(this.baseY);
        resolve();
      },
    });
  }

  private setLimp(on: boolean): void {
    this.scene.tweens.add({ targets: this.head, rotation: on ? 0.5 : 0, duration: 160 });
    this.scene.tweens.add({ targets: this.aimPivot, rotation: on ? -0.7 : 0, duration: 160 });
    this.scene.tweens.add({ targets: this.torso, rotation: on ? 0.14 : 0, duration: 160 });
  }

  private spewGibs(x: number, y: number, count: number): void {
    const e = this.scene.add.particles(x, y, 'gib', {
      speed: { min: 60, max: 210 },
      angle: { min: 0, max: 360 },
      gravityY: 900,
      lifespan: 1300,
      quantity: 1,
      rotate: { min: 0, max: 360 },
      scale: { start: 1, end: 0.6 },
      tint: 0xb01818,
      emitting: false,
    });
    e.setDepth(6);
    this.register(e);
    e.explode(count, x, y);
    this.scene.time.delayedCall(1500, () => e.destroy());
  }
}
