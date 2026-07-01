import { bowAnchorFor, type FighterState } from './combat';
import { gravityFor, speedFor } from './trajectory';
import type { AimInput } from './types';
import type { Weapon } from './weapons';

export type Difficulty = 'easy' | 'normal' | 'hard';

const ANGLE_ERROR: Record<Difficulty, number> = {
  easy: 0.11,
  normal: 0.05,
  hard: 0.025,
};

/**
 * Ballistic aim solver shared by the offline bot (client) and the server-side
 * bot fallback. Solves the launch angle for full-power speed toward the target,
 * then perturbs it by a difficulty-scaled error. Ignores wind, so a windy round
 * leaves the bot beatable. `rng` is injectable for deterministic tests.
 */
export function solveAim(
  shooter: FighterState,
  target: FighterState,
  weapon: Weapon,
  difficulty: Difficulty = 'normal',
  rng: () => number = Math.random,
): AimInput {
  const a = bowAnchorFor(shooter);
  const tx = target.baseX;
  const ty = target.baseY - 100; // aim at center mass
  const v = speedFor(weapon);
  const g = gravityFor(weapon);

  const X = tx - a.x;
  const Yup = -(ty - a.y); // up positive
  const sgn = Math.sign(X) || 1;

  let angle: number;
  if (Math.abs(X) < 1) {
    angle = -Math.PI / 2;
  } else {
    const A = (g * X * X) / (2 * v * v);
    const disc = X * X - 4 * A * (Yup + A);
    if (disc < 0) {
      angle = Math.atan2(-v * 0.7, v * 0.7 * sgn); // out of range — 45° lob
    } else {
      const sq = Math.sqrt(disc);
      const u1 = (X + sq) / (2 * A);
      const u2 = (X - sq) / (2 * A);
      const u = Math.abs(Math.atan(u1)) <= Math.abs(Math.atan(u2)) ? u1 : u2;
      const cosMag = 1 / Math.sqrt(1 + u * u);
      const vx = v * cosMag * sgn;
      const vyUp = v * u * cosMag * sgn;
      angle = Math.atan2(-vyUp, vx);
    }
  }

  angle += (rng() * 2 - 1) * ANGLE_ERROR[difficulty];
  return { angle, power: 1 };
}
