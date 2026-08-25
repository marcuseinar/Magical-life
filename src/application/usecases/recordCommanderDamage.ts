import type { PlayerId } from '$domain/ids';
import { err, ok } from '$domain/result';
import type { Result } from '$domain/result';
import { commanderDamageFrom } from '$domain/selectors';
import type { GameSession } from '../gameSession';

export type CommanderDamageError =
  'no-game' | 'not-an-integer' | 'no-change' | 'unknown-player' | 'unknown-source';

/**
 * Damage from one commander, tracked against that commander rather than as a
 * total, because twenty-one from a single commander is what is lethal.
 *
 * `from` is the commander's owner, not whoever controls it: a stolen commander
 * still deals its owner's commander damage.
 */
export const recordCommanderDamage =
  (deps: { session: GameSession }) =>
  async (
    target: PlayerId,
    from: PlayerId,
    delta: number
  ): Promise<Result<void, CommanderDamageError>> => {
    const state = deps.session.state;
    if (state === null) return err('no-game');
    if (!Number.isInteger(delta)) return err('not-an-integer');
    if (delta === 0) return err('no-change');

    const player = state.players.find((candidate) => candidate.id === target);
    if (player === undefined) return err('unknown-player');
    if (!state.players.some((candidate) => candidate.id === from)) return err('unknown-source');

    // Clamping is the reducer's job, but a correction that cannot move anything
    // is not worth an event.
    if (delta < 0 && commanderDamageFrom(player, from) === 0) return err('no-change');

    await deps.session.record({ kind: 'commander/damaged', target, from, delta });
    return ok(undefined);
  };
