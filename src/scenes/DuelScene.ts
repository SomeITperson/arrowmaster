import Phaser from 'phaser';
import {
  BOW,
  knockbackX,
  makeArena,
  opposite,
  simulateShot,
  solveAim,
  type AimInput,
  type Arena,
  type Field,
  type GameMode,
  type ShotResolvedMsg,
  type Side,
} from '@duels/shared';
import { AimController } from '../control/AimController';
import { NetClient, type DuelStateView } from '../net/NetClient';
import { DuelView, type ShotOutcome } from '../view/DuelView';
import { pickBackground } from '../view/backgrounds';

export type Opponent = 'bot' | 'online';

export interface DuelSceneData {
  opponent: Opponent;
  mode: GameMode;
}

/**
 * The playable duel. One scene, two flows (bot = local async loop, online =
 * Colyseus events). Both render through DuelView, both pick close/long mode.
 */
export class DuelScene extends Phaser.Scene {
  private opponent: Opponent = 'bot';
  private mode: GameMode = 'close';
  private mySide: Side = 'left';
  private arena!: Arena;
  private field: Field = { wind: 0 };
  private bgKey = 'bg-dusk';

  private view?: DuelView;
  private aim?: AimController;
  private net?: NetClient;

  private started = false;
  private ended = false;
  private searching?: Phaser.GameObjects.Text;

  constructor() {
    super('Duel');
  }

  init(data: DuelSceneData): void {
    this.opponent = data?.opponent ?? 'bot';
    this.mode = data?.mode ?? 'close';
    this.mySide = 'left';
    this.started = false;
    this.ended = false;
    this.bgKey = pickBackground();
  }

  create(): void {
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.cleanup());
    if (this.opponent === 'bot') this.startBotMatch();
    else this.startOnlineMatch();
  }

  override update(_time: number, deltaMs: number): void {
    this.view?.update(deltaMs);
  }

  // --- Offline (vs bot) ---------------------------------------------------

  private startBotMatch(): void {
    this.arena = makeArena(this.mode, Phaser.Math.Between(-130, 130));
    this.field = { wind: this.arena.wind };
    this.mySide = 'left';
    this.view = new DuelView(this, 'left', this.arena, this.bgKey);
    this.aim = this.makeAim('left');
    void this.runBotLoop();
  }

  private async runBotLoop(): Promise<void> {
    const view = this.view!;
    while (!this.ended) {
      view.focusShooter('left');
      view.setTurn('Твой ход — тяни назад и отпусти', '#9fe6a0');
      const myAim = await this.aim!.getShot();
      view.hideAim('left');
      const mine = this.localResolve('left', myAim);
      await view.playShot('left', myAim, mine.outcome);
      if (mine.winner) return this.finishMatch(mine.winner);

      view.focusShooter('right');
      view.setTurn('Ход противника…', '#ff9a9a');
      const botAim = solveAim(view.fighter('right').state, view.fighter('left').state, BOW, 'normal');
      view.onAim('right', botAim.angle, botAim.power);
      await this.delay(850);
      view.hideAim('right');
      const theirs = this.localResolve('right', botAim);
      await view.playShot('right', botAim, theirs.outcome);
      if (theirs.winner) return this.finishMatch(theirs.winner);
    }
  }

  private localResolve(shooter: Side, aim: AimInput): { outcome: ShotOutcome; winner: Side | null } {
    const view = this.view!;
    const targetSide = opposite(shooter);
    const res = simulateShot(
      view.fighter(shooter).state,
      view.fighter(targetSide).state,
      aim,
      this.field,
      BOW,
      this.arena.width,
    );

    let hpLeft = view.fighter('left').hp;
    let hpRight = view.fighter('right').hp;
    let leftX = view.fighter('left').baseX;
    let rightX = view.fighter('right').baseX;
    if (res.hit) {
      const dirX = shooter === 'left' ? 1 : -1;
      if (targetSide === 'left') {
        hpLeft = Math.max(0, hpLeft - res.hit.damage);
        leftX = knockbackX(leftX, res.hit.part, dirX, this.arena);
      } else {
        hpRight = Math.max(0, hpRight - res.hit.damage);
        rightX = knockbackX(rightX, res.hit.part, dirX, this.arena);
      }
    }

    const outcome: ShotOutcome = {
      hit: res.hit ? { part: res.hit.part, x: res.hit.point.x, y: res.hit.point.y, damage: res.hit.damage } : null,
      hpLeft,
      hpRight,
      leftX,
      rightX,
    };
    const winner: Side | null = hpLeft <= 0 ? 'right' : hpRight <= 0 ? 'left' : null;
    return { outcome, winner };
  }

  // --- Online (Colyseus) --------------------------------------------------

  private startOnlineMatch(): void {
    this.searching = this.add
      .text(640, 360, 'Поиск соперника…\n(бот подключится через 6с)', {
        fontFamily: 'monospace',
        fontSize: '26px',
        color: '#cfe3ff',
        align: 'center',
      })
      .setOrigin(0.5);

    this.net = new NetClient();
    this.net
      .connect(
        {
          onYou: (m) => this.onYou(m.arena, m.side),
          onOpponentAim: (m) => {
            if (m.side !== this.mySide) this.view?.onAim(m.side, m.angle, m.power);
          },
          onShot: (m) => void this.onShot(m),
          onState: (s) => this.onState(s),
          onLeave: () => this.onConnectionLost(),
        },
        this.mode,
      )
      .catch(() => this.onConnectError());
  }

  private onYou(arena: Arena, side: Side): void {
    this.mySide = side;
    this.arena = arena;
    this.field = { wind: arena.wind };
    this.searching?.destroy();
    this.searching = undefined;
    this.view = new DuelView(this, side, arena, this.bgKey);
    this.aim = this.makeAim(side, true);
    this.view.setTurn('Ожидание начала…', '#cfe3ff');
  }

  private onState(state: DuelStateView): void {
    if (!this.started && state.phase === 'playing') {
      this.started = true;
      this.beginTurn(state.turn as Side);
    }
    if (state.phase === 'finished' && !this.ended) {
      this.finishMatch((state.winner || null) as Side | null);
    }
  }

  private async onShot(msg: ShotResolvedMsg): Promise<void> {
    if (!this.view) return;
    this.view.hideAllAims();
    const outcome: ShotOutcome = {
      hit: msg.hit,
      hpLeft: msg.hpLeft,
      hpRight: msg.hpRight,
      leftX: msg.leftX,
      rightX: msg.rightX,
    };
    await this.view.playShot(msg.shooter, msg.aim, outcome);
    if (msg.winner) this.finishMatch(msg.winner);
    else if (msg.nextTurn) this.beginTurn(msg.nextTurn);
  }

  private beginTurn(side: Side): void {
    if (!this.view || this.ended) return;
    this.view.focusShooter(side);
    if (side === this.mySide) {
      this.view.setTurn('Твой ход — тяни назад и отпусти', '#9fe6a0');
      void this.aim!.getShot().then((aim) => {
        this.view?.hideAim(this.mySide);
        this.net?.sendFire(aim);
      });
    } else {
      this.view.setTurn('Ход соперника…', '#ff9a9a');
    }
  }

  private onConnectError(): void {
    this.searching?.setText('Не удалось подключиться к серверу.\nТапни — в меню');
    this.input.once('pointerdown', () => this.scene.start('Menu'));
  }

  private onConnectionLost(): void {
    if (this.ended) return;
    this.ended = true;
    this.view?.showResult(false, 'Соединение потеряно — тапни в меню', () => this.scene.start('Menu'));
  }

  // --- Shared -------------------------------------------------------------

  private makeAim(side: Side, online = false): AimController {
    return new AimController(this, this.view!.fighter(side).state, BOW, this.field, this.arena.width, {
      onAim: (angle, power) => {
        this.view?.onAim(side, angle, power);
        if (online) this.net?.sendAim(angle, power);
      },
      register: this.view!.registerWorld,
    });
  }

  private finishMatch(winner: Side | null): void {
    if (this.ended) return;
    this.ended = true;
    const won = winner === this.mySide;
    const hint = this.opponent === 'online' ? 'Тапни — новая игра' : 'Тапни, чтобы сыграть снова';
    this.view?.showResult(won, hint, () =>
      this.scene.restart({ opponent: this.opponent, mode: this.mode } satisfies DuelSceneData),
    );
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => this.time.delayedCall(ms, resolve));
  }

  private cleanup(): void {
    this.aim?.dispose();
    this.net?.dispose();
    this.aim = undefined;
    this.net = undefined;
    this.view = undefined;
  }
}
