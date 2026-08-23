import type { EventLog } from '$application/ports/eventLog';
import type { GameEvent } from '$domain/events';

/** For tests, and for the brief window before storage is available. */
export function createMemoryEventLog(seed: readonly GameEvent[] = []): EventLog {
  let events = [...seed];
  return {
    load: async () => [...events],
    append: async (incoming) => {
      events = [...events, ...incoming];
    },
    clear: async () => {
      events = [];
    }
  };
}
