import type { PlayerId } from '$domain/ids';
import { err, ok } from '$domain/result';
import type { Result } from '$domain/result';
import type { CounterKind } from '$domain/rules';
import type { GameSession } from '../gameSession';

export type CounterError = 'no-game' | 'not-an-integer' | 'no-change' | 'unknown-player';

export const changeCounter =
  (deps: { session: GameSession }) =>
  async (
    target: PlayerId,
    counter: CounterKind,
    delta: number
  ): Promise<Result<void, CounterError>> => {
    const state = deps.session.state;
    if (state === null) return err('no-game');
    if (!Number.isInteger(delta)) return err('not-an-integer');
    if (delta === 0) return err('no-change');

    const player = state.players.find((candidate) => candidate.id === target);
    if (player === undefined) return err('unknown-player');
    // Clamping is the reducer's job, but a change that cannot move anything is not an event.
    if (delta < 0 && player.counters[counter] === 0) return err('no-change');

    await deps.session.record({ kind: 'counter/changed', target, counter, delta });
    return ok(undefined);
  };
