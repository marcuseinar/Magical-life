import { err, ok } from '$domain/result';
import type { Result } from '$domain/result';
import type { GameSession } from '../gameSession';

export type RematchError = 'no-game';

/**
 * The same people, the same format, fresh totals — without walking back through
 * setup. The finished game stays in the log; a rematch is a new `game/started`
 * appended after it, not an erasure.
 */
export const rematch =
  (deps: { session: GameSession }) => async (): Promise<Result<void, RematchError>> => {
    const state = deps.session.state;
    if (state === null) return err('no-game');

    await deps.session.record({
      kind: 'game/started',
      config: state.config,
      // Seats keep their identity, so names and colours survive the rematch.
      players: state.players.map(({ id, name, colour }) => ({ id, name, colour }))
    });
    return ok(undefined);
  };
