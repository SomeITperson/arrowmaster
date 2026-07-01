import type { Arena } from './arena';
import type { AimInput, BodyPart, Side } from './types';

/**
 * Wire protocol between client and the Colyseus room. Authoritative game state
 * (HP, whose turn, wind, phase, winner) travels via the room's schema; these
 * messages carry the per-shot events on top of it.
 */

export const MSG = {
  /** server → client: private handshake telling a client its assigned side. */
  You: 'you',
  /** client → server: streamed ~15/s while drawing the bow (cosmetic). */
  Aim: 'aim',
  /** client → server: commit the shot for this turn. */
  Fire: 'fire',
  /** server → client: relay of the opponent's live aim (cosmetic). */
  OpponentAim: 'opp-aim',
  /** server → client: authoritative result of a resolved shot. */
  ShotResolved: 'shot',
} as const;

/** server → client (private, on join) */
export interface YouMsg {
  side: Side;
  arena: Arena;
}

/** client → server */
export interface AimMsg {
  angle: number;
  power: number;
}

/** client → server */
export interface FireMsg {
  angle: number;
  power: number;
}

/** server → client */
export interface OpponentAimMsg {
  side: Side;
  angle: number;
  power: number;
}

/** server → client */
export interface ShotResolvedMsg {
  shooter: Side;
  aim: AimInput;
  hit: { part: BodyPart; x: number; y: number; damage: number } | null;
  endX: number;
  endY: number;
  hpLeft: number;
  hpRight: number;
  /** Fighter X positions after the shot (they shift on knockback). */
  leftX: number;
  rightX: number;
  /** Whose turn is next, or null if the match just ended. */
  nextTurn: Side | null;
  winner: Side | null;
}
