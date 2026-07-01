import { MapSchema, Schema, type } from '@colyseus/schema';
import { MAX_HP } from '@duels/shared';

/** Authoritative per-player state, synced to both clients by Colyseus. */
export class PlayerState extends Schema {
  @type('string') side = '';
  @type('uint8') hp = MAX_HP;
  @type('boolean') bot = false;
  @type('boolean') connected = true;
  /** Current standing position (X shifts on knockback). */
  @type('number') x = 0;
  @type('number') y = 0;
}

/**
 * Authoritative match state. HP, whose turn it is, wind and the winner all live
 * here and are the single source of truth. Per-shot events ride on top via
 * room messages (see shared/protocol).
 */
export class DuelState extends Schema {
  /** 'close' | 'long' */
  @type('string') mode = 'close';
  /** 'waiting' | 'playing' | 'finished' */
  @type('string') phase = 'waiting';
  /** 'left' | 'right' — whose turn it is while playing. */
  @type('string') turn = '';
  /** Horizontal wind acceleration for the round (px/s²). */
  @type('int16') wind = 0;
  /** 'left' | 'right' | '' */
  @type('string') winner = '';
  /** Keyed by side: 'left' / 'right'. */
  @type({ map: PlayerState }) players = new MapSchema<PlayerState>();
}
