import { browser } from '$app/environment';
import { createGameSession } from '$application/gameSession';
import type { GameSession } from '$application/gameSession';
import type { EventLog } from '$application/ports/eventLog';
import type { IdSource } from '$application/ports/idSource';
import { applyLifeDelta } from '$application/usecases/applyLifeDelta';
import { changeCounter } from '$application/usecases/changeCounter';
import { setElimination } from '$application/usecases/setElimination';
import { startGame } from '$application/usecases/startGame';
import type { SeatRequest } from '$application/usecases/startGame';
import { undoLast } from '$application/usecases/undoLast';
import { randomIdSource } from '$adapters/platform/randomIdSource';
import { systemClock } from '$adapters/platform/systemClock';
import { createIndexedDbEventLog } from '$adapters/storage/indexedDbEventLog';
import { createMemoryEventLog } from '$adapters/storage/memoryEventLog';
import type { GameEvent } from '$domain/events';
import { playerId } from '$domain/ids';
import type { PlayerId } from '$domain/ids';
import type { CounterKind, FormatId } from '$domain/rules';
import type { GameState } from '$domain/state';

/**
 * The composition root: the only place that knows both which adapters exist and
 * that the UI is Svelte.
 *
 * Reactivity lives here rather than in `application/`, which is what lets the
 * use cases be tested with no framework at all.
 */
export type GameStore = ReturnType<typeof createGameStore>;

export function createGameStore(
  overrides: { log?: EventLog; ids?: IdSource; session?: GameSession } = {}
) {
  const log = overrides.log ?? (browser ? createIndexedDbEventLog() : createMemoryEventLog());
  const ids = overrides.ids ?? randomIdSource;
  const session =
    overrides.session ??
    createGameSession({
      clock: systemClock,
      log,
      // Solo play: this device is every player. A table gives each device its own id.
      authorId: playerId('device')
    });

  let state = $state<GameState | null>(null);
  let events = $state<readonly GameEvent[]>([]);
  let ready = $state(false);

  const sync = () => {
    state = session.state;
    events = session.events;
  };

  return {
    get state() {
      return state;
    },
    get events() {
      return events;
    },
    get ready() {
      return ready;
    },

    async hydrate() {
      await session.hydrate();
      sync();
      ready = true;
    },

    async begin(formatId: FormatId, seats: readonly SeatRequest[]) {
      await startGame({ session, ids })(formatId, seats);
      sync();
    },

    async changeLife(target: PlayerId, delta: number) {
      await applyLifeDelta({ session })(target, delta);
      sync();
    },

    async changeCounter(target: PlayerId, counter: CounterKind, delta: number) {
      await changeCounter({ session })(target, counter, delta);
      sync();
    },

    async setEliminated(target: PlayerId, eliminated: boolean) {
      await setElimination({ session })(target, eliminated);
      sync();
    },

    async undo() {
      await undoLast({ session })();
      sync();
    },

    async abandon() {
      await session.reset();
      sync();
    }
  };
}
