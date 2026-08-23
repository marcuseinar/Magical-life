import type { PlayerId } from '$domain/ids';
import { err, ok } from '$domain/result';
import type { Result } from '$domain/result';
import type { GameSession } from '../gameSession';

export type EliminationError = 'no-game' | 'unknown-player' | 'no-change';

/**
 * Being out is declared, never inferred. Players sit at zero life while a
 * replacement effect resolves, and an app that buries them is simply wrong.
 */
export const setElimination =
  (deps: { session: GameSession }) =>
  async (target: PlayerId, eliminated: boolean): Promise<Result<void, EliminationError>> => {
    const state = deps.session.state;
    if (state === null) return err('no-game');

    const player = state.players.find((candidate) => candidate.id === target);
    if (player === undefined) return err('unknown-player');
    if (player.eliminated === eliminated) return err('no-change');

    await deps.session.record(
      eliminated ? { kind: 'player/eliminated', target } : { kind: 'player/restored', target }
    );
    return ok(undefined);
  };
