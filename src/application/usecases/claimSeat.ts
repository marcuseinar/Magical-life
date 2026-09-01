import type { PlayerId } from '$domain/ids';
import { err, ok } from '$domain/result';
import type { Result } from '$domain/result';
import type { GameSession } from '../gameSession';

export type ClaimSeatError = 'no-game' | 'unknown-player';

/**
 * Records that this device is now playing `target`'s seat — the first thing a
 * joiner's device does once it has the host's history to fold in. Claiming an
 * already-claimed seat is a no-op rather than an error: a rejoin (the log
 * already carries the earlier claim) needs to succeed quietly, not fail.
 */
export const claimSeat =
  (deps: { session: GameSession }) =>
  async (target: PlayerId): Promise<Result<void, ClaimSeatError>> => {
    const state = deps.session.state;
    if (state === null) return err('no-game');

    const player = state.players.find((candidate) => candidate.id === target);
    if (player === undefined) return err('unknown-player');
    if (player.claimed) return ok(undefined);

    await deps.session.record({ kind: 'seat/claimed', target });
    return ok(undefined);
  };
