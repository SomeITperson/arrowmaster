import { Room, type Client } from 'colyseus';
import {
  BOW,
  MAX_HP,
  MSG,
  clampAimForward,
  knockbackX,
  makeArena,
  opposite,
  simulateShot,
  solveAim,
  type AimInput,
  type AimMsg,
  type Arena,
  type FighterState,
  type FireMsg,
  type GameMode,
  type OpponentAimMsg,
  type ShotResolvedMsg,
  type Side,
  type YouMsg,
} from '@duels/shared';
import { DuelState, PlayerState } from './DuelState';

const BOT_WAIT_MS = 6000;

/**
 * Authoritative 1v1 duel room. The arena (mode, positions, terrain) is created
 * here from the first join's options, shared with both clients, and used for the
 * server-side sim. Clients only send aim/fire intent.
 */
export class DuelRoom extends Room<{ state: DuelState }> {
  override maxClients = 2;

  private readonly sides = new Map<string, Side>();
  private arena!: Arena;
  private botWaitStarted = false;

  override onCreate(options: { mode?: GameMode } = {}): void {
    const mode: GameMode = options.mode === 'long' ? 'long' : 'close';
    this.arena = makeArena(mode, Math.round((Math.random() * 2 - 1) * 130));

    this.setState(new DuelState());
    this.state.mode = mode;
    this.state.wind = this.arena.wind;
    this.setMetadata({ mode });

    this.onMessage<AimMsg>(MSG.Aim, (client, msg) => this.handleAim(client, msg));
    this.onMessage<FireMsg>(MSG.Fire, (client, msg) => this.handleFire(client, msg));
  }

  private stateOf(side: Side): FighterState {
    const p = this.state.players.get(side);
    const fallback = side === 'left' ? this.arena.left : this.arena.right;
    return { side, baseX: p?.x ?? fallback.x, baseY: p?.y ?? fallback.y };
  }

  override onJoin(client: Client): void {
    const side: Side = this.state.players.has('left') ? 'right' : 'left';
    this.sides.set(client.sessionId, side);

    const spawn = side === 'left' ? this.arena.left : this.arena.right;
    const player = new PlayerState();
    player.side = side;
    player.hp = MAX_HP;
    player.x = spawn.x;
    player.y = spawn.y;
    this.state.players.set(side, player);

    const you: YouMsg = { side, arena: this.arena };
    client.send(MSG.You, you);

    if (this.state.players.size === 2) {
      this.lock();
      this.startMatch();
    } else if (!this.botWaitStarted) {
      this.botWaitStarted = true;
      this.clock.setTimeout(() => {
        if (this.state.players.size < 2 && this.state.phase === 'waiting') {
          this.addBot();
          this.startMatch();
        }
      }, BOT_WAIT_MS);
    }
  }

  override onLeave(client: Client): void {
    const side = this.sides.get(client.sessionId);
    if (!side) return;
    const player = this.state.players.get(side);
    if (player) player.connected = false;
    if (this.state.phase === 'playing') this.finish(opposite(side));
  }

  private addBot(): void {
    const side: Side = this.state.players.has('left') ? 'right' : 'left';
    const spawn = side === 'left' ? this.arena.left : this.arena.right;
    const bot = new PlayerState();
    bot.side = side;
    bot.hp = MAX_HP;
    bot.bot = true;
    bot.x = spawn.x;
    bot.y = spawn.y;
    this.state.players.set(side, bot);
    this.lock();
  }

  private startMatch(): void {
    this.state.phase = 'playing';
    this.state.turn = 'left';
    this.maybeBotTurn();
  }

  private handleAim(client: Client, msg: AimMsg): void {
    const side = this.sides.get(client.sessionId);
    if (!side || this.state.phase !== 'playing' || side !== this.state.turn) return;
    if (!Number.isFinite(msg.angle) || !Number.isFinite(msg.power)) return;

    const angle = clampAimForward(side, msg.angle);
    const payload: OpponentAimMsg = { side, angle, power: clamp01(msg.power) };
    this.broadcast(MSG.OpponentAim, payload, { except: client });
  }

  private handleFire(client: Client, msg: FireMsg): void {
    const side = this.sides.get(client.sessionId);
    if (!side || this.state.phase !== 'playing' || side !== this.state.turn) return;
    if (!Number.isFinite(msg.angle) || !Number.isFinite(msg.power)) return;
    this.resolveShot(side, { angle: clampAimForward(side, msg.angle), power: clamp01(msg.power) });
  }

  private maybeBotTurn(): void {
    if (this.state.phase !== 'playing') return;
    const player = this.state.players.get(this.state.turn);
    if (!player || !player.bot) return;

    const side = this.state.turn as Side;
    const aim = solveAim(this.stateOf(side), this.stateOf(opposite(side)), BOW, 'normal');

    const preview: OpponentAimMsg = { side, angle: aim.angle, power: aim.power };
    this.broadcast(MSG.OpponentAim, preview);

    this.clock.setTimeout(() => {
      if (this.state.phase === 'playing' && this.state.turn === side) this.resolveShot(side, aim);
    }, 850);
  }

  private resolveShot(shooter: Side, aim: AimInput): void {
    const targetSide = opposite(shooter);
    const target = this.state.players.get(targetSide);
    if (!target) return;

    const result = simulateShot(
      this.stateOf(shooter),
      this.stateOf(targetSide),
      aim,
      { wind: this.arena.wind },
      BOW,
      this.arena.width,
    );

    if (result.hit) {
      target.hp = Math.max(0, target.hp - result.hit.damage);
      const dirX = shooter === 'left' ? 1 : -1;
      target.x = knockbackX(target.x, result.hit.part, dirX, this.arena);
    }

    const finished = target.hp <= 0;
    const winner: Side | null = finished ? shooter : null;
    const nextTurn: Side | null = finished ? null : targetSide;

    const left = this.state.players.get('left');
    const right = this.state.players.get('right');

    const payload: ShotResolvedMsg = {
      shooter,
      aim,
      hit: result.hit
        ? { part: result.hit.part, x: result.hit.point.x, y: result.hit.point.y, damage: result.hit.damage }
        : null,
      endX: result.end.x,
      endY: result.end.y,
      hpLeft: left?.hp ?? 0,
      hpRight: right?.hp ?? 0,
      leftX: left?.x ?? this.arena.left.x,
      rightX: right?.x ?? this.arena.right.x,
      nextTurn,
      winner,
    };
    this.broadcast(MSG.ShotResolved, payload);

    if (finished && winner) this.finish(winner);
    else if (nextTurn) {
      this.state.turn = nextTurn;
      this.maybeBotTurn();
    }
  }

  private finish(winner: Side): void {
    this.state.phase = 'finished';
    this.state.winner = winner;
  }
}

function clamp01(n: number): number {
  return n < 0 ? 0 : n > 1 ? 1 : n;
}
