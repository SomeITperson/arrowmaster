import Phaser from 'phaser';

type Register = (obj: Phaser.GameObjects.GameObject) => void;
type Part = Phaser.Physics.Matter.Image;

/**
 * A Matter.js ragdoll: separate rigid bodies (head, torso, two thighs + shins
 * with knee joints, one arm with an elbow) wired together with pin constraints.
 * Parts don't collide with each other (shared negative group) but do collide
 * with the static ground, so the body tumbles and folds naturally on impact.
 * Launched with an initial velocity toward the authoritative landing spot.
 */
export class Ragdoll {
  private readonly scene: Phaser.Scene;
  private readonly parts: Part[] = [];
  private readonly joints: MatterJS.ConstraintType[] = [];

  constructor(scene: Phaser.Scene, fx: number, fy: number, skin: number, vx: number, vy: number, register: Register) {
    this.scene = scene;
    const group = scene.matter.world.nextGroup(true); // same negative group = never collide each other

    const part = (key: string, dx: number, dy: number, w: number, h: number, circle = false): Part => {
      const opts = {
        shape: circle ? { type: 'circle', radius: w / 2 } : { type: 'rectangle', width: w, height: h },
      } as Phaser.Types.Physics.Matter.MatterBodyConfig;
      const img = scene.matter.add.image(fx + dx, fy + dy, key, undefined, opts);
      img.setDisplaySize(w, h);
      img.setTint(skin);
      img.setCollisionGroup(group);
      img.setFriction(0.6, 0.02);
      img.setBounce(0.15);
      img.setDepth(4);
      register(img);
      this.parts.push(img);
      return img;
    };

    // Sizes match the standing rig so the body doesn't appear to shrink.
    const torso = part('torso_0', 0, -100, 46, 70);
    const head = part('head', 4, -150, 44, 44, true);
    const thighL = part('limb', -9, -50, 18, 34);
    const shinL = part('limb', -9, -18, 16, 32);
    const thighR = part('limb', 9, -50, 18, 34);
    const shinR = part('limb', 9, -18, 16, 32);
    // Two arms, sized like the standing rig so the body matches when it falls.
    const upperArmF = part('limb', 14, -118, 12, 28);
    const foreArmF = part('limb', 28, -92, 11, 26);
    const upperArmB = part('limb', -10, -118, 12, 28);
    const foreArmB = part('limb', -22, -92, 11, 26);

    const join = (a: Part, b: Part, pa: MatterJS.Vector, pb: MatterJS.Vector, stiff = 0.7): void => {
      this.joints.push(
        scene.matter.add.constraint(a.body as MatterJS.BodyType, b.body as MatterJS.BodyType, 0, stiff, {
          pointA: pa,
          pointB: pb,
        }),
      );
    };
    join(torso, head, { x: 0, y: -33 }, { x: 0, y: 17 }, 0.85);
    join(torso, thighL, { x: -9, y: 33 }, { x: 0, y: -16 });
    join(thighL, shinL, { x: 0, y: 16 }, { x: 0, y: -15 }); // knee
    join(torso, thighR, { x: 9, y: 33 }, { x: 0, y: -16 });
    join(thighR, shinR, { x: 0, y: 16 }, { x: 0, y: -15 }); // knee
    join(torso, upperArmF, { x: 12, y: -30 }, { x: 0, y: -14 });
    join(upperArmF, foreArmF, { x: 0, y: 14 }, { x: 0, y: -13 }); // front elbow
    join(torso, upperArmB, { x: -12, y: -30 }, { x: 0, y: -14 });
    join(upperArmB, foreArmB, { x: 0, y: 14 }, { x: 0, y: -13 }); // back elbow

    // Throw the body — joints drag the limbs into a natural tumble.
    torso.setVelocity(vx, -vy);
    torso.setAngularVelocity(Math.sign(vx || 1) * 0.2);
    head.setVelocity(vx * 1.1, -vy * 1.1);
  }

  destroy(): void {
    for (const j of this.joints) this.scene.matter.world.removeConstraint(j);
    for (const p of this.parts) p.destroy();
    this.parts.length = 0;
    this.joints.length = 0;
  }
}
