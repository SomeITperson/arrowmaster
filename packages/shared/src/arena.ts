import { GAME_WIDTH, GROUND_Y } from './constants';
import type { GameMode } from './types';

/** A fighter's standing position (feet) in world space. */
export interface Spawn {
  x: number;
  y: number;
}

/**
 * The agreed match layout. Because fighter positions and terrain height feed the
 * deterministic sim, the arena is created once and shared by client and server
 * (the server sends it to clients on join).
 */
export interface Arena {
  mode: GameMode;
  wind: number;
  left: Spawn;
  right: Spawn;
  /** Total world width — wider than the screen in 'long' mode. */
  width: number;
}

/**
 * Build an arena for a mode. 'close' keeps both fighters on one screen on flat
 * ground; 'long' spreads them near the projectile's max range (opponent
 * off-screen) and raises the right fighter onto a hill (varied terrain).
 */
export function makeArena(mode: GameMode, wind: number, rng: () => number = Math.random): Arena {
  if (mode === 'close') {
    return {
      mode,
      wind,
      left: { x: 380, y: GROUND_Y },
      right: { x: 900, y: GROUND_Y },
      width: GAME_WIDTH,
    };
  }
  const rightX = 1480;
  const rightY = GROUND_Y - Math.round(rng() * 140); // stand on a hill
  return {
    mode,
    wind,
    left: { x: 160, y: GROUND_Y },
    right: { x: rightX, y: rightY },
    width: rightX + 160,
  };
}
