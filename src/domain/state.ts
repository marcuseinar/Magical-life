import type { EventId, PlayerId } from './ids';
import type { CounterKind, FlagKind, FormatId, ManaColour } from './rules';

export type GameConfig = {
  readonly format: FormatId;
  readonly startingLife: number;
  readonly tracksCommanderDamage: boolean;
};

/** What a game needs to know about a player before it starts. */
export type PlayerSeat = {
  readonly id: PlayerId;
  readonly name: string;
  readonly colour: ManaColour;
};

export type PlayerState = PlayerSeat & {
  readonly life: number;
  readonly counters: Readonly<Record<CounterKind, number>>;
  readonly eliminated: boolean;
};

export type GameState = {
  readonly config: GameConfig;
  readonly players: readonly PlayerState[];
  readonly flags: Readonly<Record<FlagKind, PlayerId | null>>;
  readonly firstPlayer: PlayerId | null;
  readonly ended: boolean;
  readonly winner: PlayerId | null;
};

export type { EventId, PlayerId };
