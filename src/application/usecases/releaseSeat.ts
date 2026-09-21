import type { PlayerId } from '$domain/ids';
import { err, ok } from '$domain/result';
import type { Result } from '$domain/result';
import type { GameSession } from '../gameSession';

export type ReleaseSeatError = 'no-game' | 'unknown-player';

/**
 * Records that nobody is playing `target`'s seat from a device anymore — the
 * host's way to open a claimed seat back up. Releasing an already-free seat
 * is a no-op, the same reasoning `claimSeat`'s no-op has: it needs to succeed
 * quietly on a seat that never got claimed in the first place, not fail.
 */
export const releaseSeat =
  (deps: { session: GameSession }) =>
  async (target: PlayerId): Promise<Result<void, ReleaseSeatError>> => {
    const state = deps.session.state;
    if (state === null) return err('no-game');

    const player = state.players.find((candidate) => candidate.id === target);
    if (player === undefined) return err('unknown-player');
    if (!player.claimed) return ok(undefined);

    await deps.session.record({ kind: 'seat/released', target });
    return ok(undefined);
  };
