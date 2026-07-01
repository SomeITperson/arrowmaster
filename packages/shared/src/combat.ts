import type { Arena } from './arena';
import { GAME_HEIGHT, GAME_WIDTH, GROUND_Y } from './constants';
import { solutionFor, stepProjectile, type Field } from './trajectory';
import type { AimInput, BodyPart, Side } from './types';
import { facingOf } from './types';
import { clamp, type Vec2 } from './vec';
import type { Weapon } from './weapons';

/**
 * Hitboxes in local (facing-right) space, with the fighter's feet at the origin.
 * The client draws the body to match these exactly, and both client and server
 * hit-test against them, so "what got hit" is identical everywhere.
 */
export const HITBOX = {
  head: { x: 4, y: -150, r: 22 },
  torso: { x: 0, y: -100, w: 46, h: 74 },
  legs: { x: 0, y: -32, w: 40, h: 64 },
} as const;

export interface FighterState {
  side: Side;
  baseX: number;
  /** Feet Y in world space (varies with terrain). */
  baseY: number;
}

/** Where this fighter's projectiles spawn / are aimed from (the bow hand). */
export function bowAnchorFor(state: FighterState): Vec2 {
  return { x: state.baseX + facingOf(state.side) * 52, y: state.baseY - 112 };
}

/** Screen-space angle that points straight toward the opponent (no elevation). */
export function aimForward(side: Side): number {
  return side === 'left' ? 0 : Math.PI;
}

/** Signed elevation of `angle` relative to the forward axis, in radians. */
export function aimElevation(side: Side, angle: number): number {
  const f = aimForward(side);
  return Math.atan2(Math.sin(angle - f), Math.cos(angle - f));
}

/**
 * Clamp an aim angle into the forward firing cone so a fighter can never shoot
 * backwards (or straight up/down past maxElevDeg). Used by the client for the
 * live preview and by the server to validate every shot.
 */
export function clampAimForward(side: Side, angle: number, maxElevDeg = 85): number {
  const max = (maxElevDeg * Math.PI) / 180;
  const d = clamp(aimElevation(side, angle), -max, max);
  return aimForward(side) + d;
}

/** Which body part a world point hits on `target`, or null for a miss. */
export function hitTestFighter(target: FighterState, p: Vec2): BodyPart | null {
  const facing = facingOf(target.side);
  const lx = (p.x - target.baseX) * facing; // into facing-right local space
  const ly = p.y - target.baseY;

  const h = HITBOX.head;
  const dx = lx - h.x;
  const dy = ly - h.y;
  if (dx * dx + dy * dy <= h.r * h.r) return 'head';

  const t = HITBOX.torso;
  if (Math.abs(lx - t.x) <= t.w / 2 && Math.abs(ly - t.y) <= t.h / 2) return 'torso';

  const l = HITBOX.legs;
  if (Math.abs(lx - l.x) <= l.w / 2 && Math.abs(ly - l.y) <= l.h / 2) return 'legs';

  return null;
}

/** Authoritative horizontal knockback distance per body part hit (px). */
export const KNOCKBACK: Record<BodyPart, number> = { head: 170, torso: 100, legs: 60 };

/**
 * New X of a fighter after being hit, clamped inside the arena. Deterministic so
 * the client and server agree on where the body lands and the fighter re-stands.
 * `dirX` is the shot travel direction (+1 = pushed right).
 */
export function knockbackX(x: number, part: BodyPart, dirX: number, arena: Arena): number {
  return clamp(x + dirX * KNOCKBACK[part], 60, arena.width - 60);
}

export interface ShotResult {
  hit: { part: BodyPart; point: Vec2; damage: number } | null;
  end: Vec2;
}

/**
 * Authoritative shot resolution. Deterministic given identical inputs. `maxX` is
 * the arena width so long-range arenas don't cut the arrow off early.
 */
export function simulateShot(
  shooter: FighterState,
  target: FighterState,
  aim: AimInput,
  field: Field,
  weapon: Weapon,
  maxX: number = GAME_WIDTH,
): ShotResult {
  const start = bowAnchorFor(shooter);
  const sol = solutionFor(aim, weapon);
  const pos: Vec2 = { x: start.x, y: start.y };
  const vel: Vec2 = { x: sol.vx, y: sol.vy };

  for (let i = 0; i < 800; i++) {
    stepProjectile(pos, vel, weapon, field);

    const part = hitTestFighter(target, pos);
    if (part) {
      return {
        hit: { part, point: { x: pos.x, y: pos.y }, damage: weapon.damage[part] },
        end: { x: pos.x, y: pos.y },
      };
    }
    if (pos.y >= GROUND_Y || pos.x < -120 || pos.x > maxX + 120 || pos.y > GAME_HEIGHT + 120) {
      break;
    }
  }
  return { hit: null, end: { x: pos.x, y: pos.y } };
}
