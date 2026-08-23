import type { GameEvent } from '$domain/events';

/** Durable storage for the append-only log. The log *is* the saved game. */
export type EventLog = {
  load(): Promise<GameEvent[]>;
  append(events: readonly GameEvent[]): Promise<void>;
  clear(): Promise<void>;
};
