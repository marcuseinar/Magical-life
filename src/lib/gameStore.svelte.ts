import { browser } from '$app/environment';
import { createGameSession } from '$application/gameSession';
import type { GameSession } from '$application/gameSession';
import type { EventLog } from '$application/ports/eventLog';
import type { IdSource } from '$application/ports/idSource';
import type { Rng } from '$application/ports/rng';
import { applyLifeDelta } from '$application/usecases/applyLifeDelta';
import { changeCounter } from '$application/usecases/changeCounter';
import { chooseFirstPlayer } from '$application/usecases/chooseFirstPlayer';
import { recordCommanderDamage } from '$application/usecases/recordCommanderDamage';
import { rematch } from '$application/usecases/rematch';
import { setElimination } from '$application/usecases/setElimination';
import { startGame } from '$application/usecases/startGame';
import type { SeatRequest } from '$application/usecases/startGame';
import { undoLast } from '$application/usecases/undoLast';
import { randomIdSource } from '$adapters/platform/randomIdSource';
import { systemClock } from '$adapters/platform/systemClock';
import { systemRng } from '$adapters/platform/systemRng';
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
  overrides: { log?: EventLog; ids?: IdSource; rng?: Rng; session?: GameSession } = {}
) {
  const log = overrides.log ?? (browser ? createIndexedDbEventLog() : createMemoryEventLog());
  const ids = overrides.ids ?? randomIdSource;
  const rng = overrides.rng ?? systemRng;
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

    /**
     * `from` names the commander that dealt it, when the player tagged the
     * change. One gesture then writes both events with the same number, so the
     * life total and the commander damage cannot drift apart.
     */
    async changeLife(target: PlayerId, delta: number, from: PlayerId | null = null) {
      await applyLifeDelta({ session })(target, delta);
      if (from !== null && delta < 0) {
        await recordCommanderDamage({ session })(target, from, -delta);
      }
      sync();
    },

    async changeCommanderDamage(target: PlayerId, from: PlayerId, delta: number) {
      await recordCommanderDamage({ session })(target, from, delta);
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

    async chooseFirstPlayer() {
      const result = await chooseFirstPlayer({ session, rng })();
      sync();
      return result;
    },

    /** Same people, same format, fresh totals. */
    async rematch() {
      await rematch({ session })();
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
