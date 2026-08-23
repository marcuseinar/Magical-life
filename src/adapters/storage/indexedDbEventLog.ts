import { openDB } from 'idb';
import type { IDBPDatabase } from 'idb';
import type { EventLog } from '$application/ports/eventLog';
import type { GameEvent } from '$domain/events';

const DB_NAME = 'magical-life';
const DB_VERSION = 1;
const STORE = 'events';

/**
 * The log is the saved game, so persistence is a `put` per event and a `getAll`
 * on start. Keyed by EventId, which makes re-appending a known event a no-op —
 * the same idempotence the reducer already guarantees.
 */
export function createIndexedDbEventLog(): EventLog {
  let connection: Promise<IDBPDatabase> | null = null;

  const db = () =>
    (connection ??= openDB(DB_NAME, DB_VERSION, {
      upgrade(database) {
        if (!database.objectStoreNames.contains(STORE)) {
          database.createObjectStore(STORE, { keyPath: 'id' });
        }
      }
    }));

  return {
    async load() {
      return (await (await db()).getAll(STORE)) as GameEvent[];
    },

    async append(events) {
      const transaction = (await db()).transaction(STORE, 'readwrite');
      await Promise.all(events.map((event) => transaction.store.put(event)));
      await transaction.done;
    },

    async clear() {
      await (await db()).clear(STORE);
    }
  };
}
