export type BodyPart = 'head' | 'torso' | 'legs';

export type Side = 'left' | 'right';

/** Close-range (both fighters on screen) vs long-range (opponent off-screen). */
export type GameMode = 'close' | 'long';

/** Canonical shot command sent over the wire and produced by any shooter. */
export interface AimInput {
  /** Launch angle in radians, screen-space (y down). */
  angle: number;
  /** Draw strength, 0..1. */
  power: number;
}

/** Resolved launch velocity in px/s screen-space, derived from an AimInput. */
export interface AimSolution {
  vx: number;
  vy: number;
}

export const opposite = (side: Side): Side => (side === 'left' ? 'right' : 'left');

export const facingOf = (side: Side): 1 | -1 => (side === 'left' ? 1 : -1);
