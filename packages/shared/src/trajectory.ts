import { GRAVITY, LAUNCH_SPEED, SIM_DT } from './constants';
import type { AimInput, AimSolution } from './types';
import { clamp, type Vec2 } from './vec';
import type { Weapon } from './weapons';

/** Environmental forces for the current round. */
export interface Field {
  /** Horizontal acceleration applied to projectiles (px/s²). */
  wind: number;
}

export function gravityFor(weapon: Weapon): number {
  return GRAVITY * weapon.gravityScale;
}

export function speedFor(weapon: Weapon): number {
  return LAUNCH_SPEED * weapon.speedScale;
}

/** Convert the canonical AimInput into a launch velocity (px/s). */
export function solutionFor(input: AimInput, weapon: Weapon): AimSolution {
  const speed = clamp(input.power, 0, 1) * speedFor(weapon);
  return { vx: Math.cos(input.angle) * speed, vy: Math.sin(input.angle) * speed };
}

/**
 * Advance one projectile state by one fixed step. Mutates and returns `out`.
 * This is the single integration step both the live Arrow and the server use,
 * so flight is identical everywhere.
 */
export function stepProjectile(pos: Vec2, vel: Vec2, weapon: Weapon, field: Field, dt: number = SIM_DT): void {
  vel.x += field.wind * dt;
  vel.y += gravityFor(weapon) * dt;
  pos.x += vel.x * dt;
  pos.y += vel.y * dt;
}

/**
 * Sample the flight path for the aim preview. Identical math to stepProjectile,
 * so the dotted preview matches the real arrow exactly.
 */
export function predictPath(
  start: Vec2,
  vel: Vec2,
  weapon: Weapon,
  field: Field,
  groundY: number,
  maxX: number,
): Vec2[] {
  const points: Vec2[] = [];
  const p: Vec2 = { x: start.x, y: start.y };
  const v: Vec2 = { x: vel.x, y: vel.y };

  for (let i = 0; i < 260; i++) {
    stepProjectile(p, v, weapon, field);
    if (i % 4 === 0) points.push({ x: p.x, y: p.y });
    if (p.y >= groundY || p.x < -60 || p.x > maxX + 60) break;
  }
  return points;
}
