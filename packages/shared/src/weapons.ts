import type { BodyPart } from './types';

/**
 * A weapon definition. New weapons (crossbow, axe, throwing knife...) are added
 * by appending to WEAPONS — both client and server read everything from here,
 * so balance stays in one place.
 */
export interface Weapon {
  id: string;
  name: string;
  /** Multiplies the global LAUNCH_SPEED. */
  speedScale: number;
  /** Multiplies the global GRAVITY for this projectile's arc. */
  gravityScale: number;
  /** Damage dealt per body part hit. */
  damage: Record<BodyPart, number>;
  /** Tint of the projectile sprite (client-only cosmetic). */
  color: number;
}

export const BOW: Weapon = {
  id: 'bow',
  name: 'Лук',
  speedScale: 1,
  gravityScale: 1,
  damage: { head: 65, torso: 32, legs: 18 },
  color: 0xffd479,
};

export const WEAPONS: Record<string, Weapon> = {
  [BOW.id]: BOW,
};

export function weaponById(id: string): Weapon {
  return WEAPONS[id] ?? BOW;
}
