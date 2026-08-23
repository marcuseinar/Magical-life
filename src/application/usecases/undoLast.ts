import type { GameEvent } from '$domain/events';
import type { EventId } from '$domain/ids';
import { err, ok } from '$domain/result';
import type { Result } from '$domain/result';
import type { GameSession } from '../gameSession';

export type UndoError = 'nothing-to-undo';

/** Never undone: it would unseat every player mid-game. */
const isUndoable = (event: GameEvent) =>
  event.kind !== 'game/started' && event.kind !== 'event/retracted';

/**
 * Undo is a retraction event appended to the log, not a mutation of it.
 * History is never rewritten, so undo survives a reload and syncs to peers.
 */
export const undoLast =
  (deps: { session: GameSession }) => async (): Promise<Result<EventId, UndoError>> => {
    const alreadyRetracted = new Set<EventId>(
      deps.session.events.flatMap((event) =>
        event.kind === 'event/retracted' ? [event.retracts] : []
      )
    );

    const victim = [...deps.session.events]
      .reverse()
      .find((event) => isUndoable(event) && !alreadyRetracted.has(event.id));

    if (victim === undefined) return err('nothing-to-undo');

    await deps.session.record({ kind: 'event/retracted', retracts: victim.id });
    return ok(victim.id);
  };
