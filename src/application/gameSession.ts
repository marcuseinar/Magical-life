import type { EventBody, GameEvent } from '$domain/events';
import { envelopeId } from '$domain/events';
import type { PlayerId } from '$domain/ids';
import { fold, orderEvents } from '$domain/reducer';
import type { GameState } from '$domain/state';
import type { Clock } from './ports/clock';
import type { EventLog } from './ports/eventLog';

export type GameSessionDeps = {
  readonly clock: Clock;
  readonly log: EventLog;
  /** This device's player. Under ADR 0002 it may only author events about itself —
   *  except in solo play, where this device *is* every player. */
  readonly authorId: PlayerId;
};

export type GameSession = {
  readonly state: GameState | null;
  readonly events: readonly GameEvent[];
  hydrate(): Promise<void>;
  record(body: EventBody): Promise<GameEvent>;
  merge(incoming: readonly GameEvent[]): Promise<void>;
  reset(): Promise<void>;
};

/**
 * Holds one game's log and derives its state.
 *
 * Deliberately has no subscription mechanism: reactivity is a UI concern, and
 * keeping it out of here is what lets this layer be tested without a framework.
 */
export function createGameSession({ clock, log, authorId }: GameSessionDeps): GameSession {
  let events: GameEvent[] = [];
  let state: GameState | null = null;

  const recompute = () => {
    events = orderEvents(events);
    state = fold(events);
  };

  const nextLamport = () => events.reduce((max, event) => Math.max(max, event.lamport), -1) + 1;

  const nextSeq = () =>
    events
      .filter((event) => event.authorId === authorId)
      .reduce((max, event) => Math.max(max, event.seq), -1) + 1;

  return {
    get state() {
      return state;
    },
    get events() {
      return events;
    },

    async hydrate() {
      events = await log.load();
      recompute();
    },

    async record(body: EventBody) {
      const seq = nextSeq();
      const event: GameEvent = {
        ...body,
        id: envelopeId(authorId, seq),
        authorId,
        seq,
        at: clock.now(),
        lamport: nextLamport()
      };
      events = [...events, event];
      recompute();
      await log.append([event]);
      return event;
    },

    async merge(incoming: readonly GameEvent[]) {
      events = [...events, ...incoming];
      recompute();
      await log.append(incoming);
    },

    async reset() {
      events = [];
      state = null;
      await log.clear();
    }
  };
}
