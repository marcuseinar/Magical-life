import type { ManaColour } from '$domain/rules';
import { MAX_PLAYERS } from '$domain/rules';
import { err, ok } from '$domain/result';
import type { Result } from '$domain/result';
import type { PlayerSeat } from '$domain/state';
import type { GameSession } from '../gameSession';
import type { IdSource } from '../ports/idSource';

export type AddSeatError = 'no-game' | 'table-full';

export type NewSeat = { readonly name: string; readonly colour: ManaColour };

/**
 * Seats a new player at a game already running — the host adding a fifth
 * player on turn nine. Distinct from `startGame`: it grows the table rather
 * than replacing it, so a device mid-game keeps everything it has instead of
 * folding a fresh state. The new seat starts at the game's own starting
 * life, unclaimed, exactly as if it had been there from the beginning.
 */
export const addSeat =
  (deps: { session: GameSession; ids: IdSource }) =>
  async (seat: NewSeat): Promise<Result<PlayerSeat['id'], AddSeatError>> => {
    const state = deps.session.state;
    if (state === null) return err('no-game');
    if (state.players.length >= MAX_PLAYERS) return err('table-full');

    const id = deps.ids.next() as PlayerSeat['id'];
    await deps.session.record({
      kind: 'seat/added',
      seat: { id, name: seat.name, colour: seat.colour }
    });
    return ok(id);
  };
