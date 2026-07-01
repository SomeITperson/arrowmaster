// Tunables shared by client rendering and server-authoritative simulation.
// All physics is custom (px / seconds), mapping directly to screen space.

export const GAME_WIDTH = 1280;
export const GAME_HEIGHT = 720;

/** Y of the ground line — fighters stand with their feet here. */
export const GROUND_Y = GAME_HEIGHT - 90;

/** Horizontal distance of each fighter from its screen edge. */
export const FIGHTER_MARGIN = 170;

/** Baseline downward acceleration applied to projectiles (px/s²). */
export const GRAVITY = 1100;

/**
 * Projectile launch speed at full draw (px/s). Weapons scale this.
 * Max flat range ≈ speed²/gravity ≈ 1650²/1100 ≈ 2475px — comfortably beyond
 * the long-range arena even into a headwind.
 */
export const LAUNCH_SPEED = 1650;

/** Drag distance (px) below which a release does not fire. */
export const MIN_DRAG = 14;

/** Drag distance (px) that corresponds to full power. */
export const MAX_DRAG = 250;

/** Fixed timestep for the deterministic projectile sim (seconds). */
export const SIM_DT = 1 / 60;

export const MAX_HP = 100;
