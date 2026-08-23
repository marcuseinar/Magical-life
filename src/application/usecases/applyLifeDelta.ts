import type { PlayerId } from '$domain/ids';
import { err, ok } from '$domain/result';
import type { Result } from '$domain/result';
import type { GameSession } from '../gameSession';

export type LifeDeltaError = 'no-game' | 'not-an-integer' | 'no-change' | 'unknown-player';

/** Commits an accumulated delta as one event, so the log reads "−7" and not seven "−1"s. */
export const applyLifeDelta =
  (deps: { session: GameSession }) =>
  async (target: PlayerId, delta: number): Promise<Result<void, LifeDeltaError>> => {
    const state = deps.session.state;
    if (state === null) return err('no-game');
    if (!Number.isInteger(delta)) return err('not-an-integer');
    if (delta === 0) return err('no-change');
    if (!state.players.some((player) => player.id === target)) return err('unknown-player');

    await deps.session.record({ kind: 'life/changed', target, delta });
    return ok(undefined);
  };
