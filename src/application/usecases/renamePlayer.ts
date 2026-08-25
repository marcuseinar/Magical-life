import type { PlayerId } from '$domain/ids';
import { err, ok } from '$domain/result';
import type { Result } from '$domain/result';
import { MAX_PLAYER_NAME } from '$domain/rules';
import type { GameSession } from '../gameSession';

export type RenameError = 'no-game' | 'unknown-player' | 'empty' | 'no-change';

/**
 * Tidying happens here rather than in the domain: trimming and clamping are
 * decisions about what a person meant to type, and `domain/` only stores the
 * name it is given.
 */
export const tidyName = (name: string): string =>
  name.replace(/\s+/g, ' ').trim().slice(0, MAX_PLAYER_NAME);

export const renamePlayer =
  (deps: { session: GameSession }) =>
  async (target: PlayerId, name: string): Promise<Result<string, RenameError>> => {
    const state = deps.session.state;
    if (state === null) return err('no-game');

    const player = state.players.find((candidate) => candidate.id === target);
    if (player === undefined) return err('unknown-player');

    const tidied = tidyName(name);
    if (tidied === '') return err('empty');
    if (tidied === player.name) return err('no-change');

    await deps.session.record({ kind: 'player/renamed', target, name: tidied });
    return ok(tidied);
  };
