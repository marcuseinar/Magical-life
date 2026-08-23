import type { PlayerId } from '$domain/ids';
import { err, ok } from '$domain/result';
import type { Result } from '$domain/result';
import type { FlagKind } from '$domain/rules';
import type { GameSession } from '../gameSession';

export type FlagError = 'no-game' | 'unknown-player' | 'no-change';

/** Monarch, the initiative, the city's blessing: held by exactly one player, or nobody. */
export const moveFlag =
  (deps: { session: GameSession }) =>
  async (flag: FlagKind, to: PlayerId | null): Promise<Result<void, FlagError>> => {
    const state = deps.session.state;
    if (state === null) return err('no-game');
    if (state.flags[flag] === to) return err('no-change');
    if (to !== null && !state.players.some((player) => player.id === to)) {
      return err('unknown-player');
    }

    await deps.session.record({ kind: 'flag/moved', flag, to });
    return ok(undefined);
  };
