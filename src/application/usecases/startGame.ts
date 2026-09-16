import { FORMATS } from '$domain/rules';
import type { FormatId, ManaColour } from '$domain/rules';
import type { PlayerId } from '$domain/ids';
import type { PlayerSeat } from '$domain/state';
import type { GameSession } from '../gameSession';
import type { IdSource } from '../ports/idSource';

export type SeatRequest = {
  /**
   * The seat's existing identity, when it has one. Reconfiguring a game is
   * not meeting new people: carrying the id keeps the name, the colour, and
   * — because `reduce` folds claims forward by seat id — whichever device is
   * playing that seat. Absent for a seat nobody has sat in yet, which is
   * every seat of a genuinely new table.
   */
  readonly id?: PlayerId;
  readonly name: string;
  readonly colour: ManaColour;
};

/**
 * Begins a game. Starting a new one over the top of an old one is legal and is
 * how "rematch" works — the previous game stays in the log.
 */
export const startGame =
  (deps: { session: GameSession; ids: IdSource }) =>
  async (formatId: FormatId, requests: readonly SeatRequest[], startingLife?: number) => {
    const format = FORMATS[formatId];
    const players: PlayerSeat[] = requests.map((request) => ({
      id: request.id ?? (deps.ids.next() as PlayerSeat['id']),
      name: request.name,
      colour: request.colour
    }));

    return deps.session.record({
      kind: 'game/started',
      config: {
        format: format.id,
        startingLife: startingLife ?? format.startingLife,
        tracksCommanderDamage: format.tracksCommanderDamage
      },
      players
    });
  };
