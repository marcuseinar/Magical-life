import type { EventId, PlayerId } from './ids';
import type { CounterKind, FlagKind } from './rules';
import type { GameConfig, PlayerSeat } from './state';

/** What happened. Every durable change to a game is one of these. */
export type EventBody =
  | {
      readonly kind: 'game/started';
      readonly config: GameConfig;
      readonly players: readonly PlayerSeat[];
    }
  | { readonly kind: 'life/changed'; readonly target: PlayerId; readonly delta: number }
  | {
      readonly kind: 'counter/changed';
      readonly target: PlayerId;
      readonly counter: CounterKind;
      readonly delta: number;
    }
  | { readonly kind: 'flag/moved'; readonly flag: FlagKind; readonly to: PlayerId | null }
  /** Who takes the first turn. Chosen at random, but the *choice* is made
   *  outside the domain and arrives here as a decided fact. */
  | { readonly kind: 'turn/firstPlayer'; readonly target: PlayerId }
  | { readonly kind: 'player/eliminated'; readonly target: PlayerId }
  | { readonly kind: 'player/restored'; readonly target: PlayerId }
  | { readonly kind: 'event/retracted'; readonly retracts: EventId }
  | { readonly kind: 'game/ended'; readonly winner: PlayerId | null };

export type EventKind = EventBody['kind'];

/**
 * Who wrote it, and where it sits in the total order.
 *
 * `id` is `${authorId}:${seq}`, so uniqueness across peers is structural rather
 * than probabilistic. `at` is for display only — never for ordering, because
 * device clocks disagree.
 */
export type Envelope = {
  readonly id: EventId;
  readonly authorId: PlayerId;
  readonly seq: number;
  readonly at: number;
  readonly lamport: number;
};

export type GameEvent = Envelope & EventBody;

export const envelopeId = (authorId: PlayerId, seq: number): EventId =>
  `${authorId}:${seq}` as EventId;
