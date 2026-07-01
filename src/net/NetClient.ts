import { Client, type Room } from 'colyseus.js';
import {
  MSG,
  type AimInput,
  type GameMode,
  type OpponentAimMsg,
  type ShotResolvedMsg,
  type YouMsg,
} from '@duels/shared';

/** Structural view of the room's synced schema (we only read these fields). */
export interface DuelStateView {
  phase: string;
  turn: string;
  wind: number;
  winner: string;
}

export interface NetHandlers {
  onYou(msg: YouMsg): void;
  onOpponentAim(msg: OpponentAimMsg): void;
  onShot(msg: ShotResolvedMsg): void;
  onState(state: DuelStateView): void;
  onLeave(code: number): void;
}

/**
 * Thin wrapper over colyseus.js. Connects to the authoritative duel room,
 * forwards server messages/state, and sends the local player's aim and fire
 * intents. All game rules live on the server — this only transports intent.
 */
export class NetClient {
  private readonly client: Client;
  private room?: Room<DuelStateView>;

  constructor(endpoint: string = defaultEndpoint()) {
    this.client = new Client(endpoint);
  }

  async connect(handlers: NetHandlers, mode: GameMode): Promise<void> {
    const room = await this.client.joinOrCreate<DuelStateView>('duel', { mode });
    this.room = room;

    room.onMessage<YouMsg>(MSG.You, (m) => handlers.onYou(m));
    room.onMessage<OpponentAimMsg>(MSG.OpponentAim, (m) => handlers.onOpponentAim(m));
    room.onMessage<ShotResolvedMsg>(MSG.ShotResolved, (m) => handlers.onShot(m));
    room.onStateChange((state) => handlers.onState(state));
    room.onLeave((code) => handlers.onLeave(code));
  }

  sendAim(angle: number, power: number): void {
    this.room?.send(MSG.Aim, { angle, power });
  }

  sendFire(aim: AimInput): void {
    this.room?.send(MSG.Fire, aim);
  }

  dispose(): void {
    void this.room?.leave();
    this.room = undefined;
  }
}

/** Server URL — override with VITE_SERVER_URL, default to localhost dev. */
function defaultEndpoint(): string {
  const fromEnv = import.meta.env.VITE_SERVER_URL as string | undefined;
  return fromEnv ?? 'ws://localhost:2567';
}
