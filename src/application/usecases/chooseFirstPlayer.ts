import type { PlayerId } from '$domain/ids';
import { err, ok } from '$domain/result';
import type { Result } from '$domain/result';
import { livingPlayers } from '$domain/selectors';
import type { GameSession } from '../gameSession';
import type { Rng } from '../ports/rng';

export type FirstPlayerError = 'no-game' | 'no-players';

/**
 * Settles the argument nobody wants to have. Only players still in the game are
 * eligible, so re-rolling after an elimination cannot hand the turn to someone
 * who is out.
 */
export const chooseFirstPlayer =
  (deps: { session: GameSession; rng: Rng }) =>
  async (): Promise<Result<PlayerId, FirstPlayerError>> => {
    const state = deps.session.state;
    if (state === null) return err('no-game');

    const candidates = livingPlayers(state);
    if (candidates.length === 0) return err('no-players');

    const index = Math.min(candidates.length - 1, Math.floor(deps.rng.next() * candidates.length));
    const chosen = candidates[index]!.id;

    await deps.session.record({ kind: 'turn/firstPlayer', target: chosen });
    return ok(chosen);
  };
