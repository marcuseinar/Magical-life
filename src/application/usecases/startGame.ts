import type { ManaColour } from '$domain/rules';
import type { PlayerId } from '$domain/ids';
import type { GameConfig, PlayerSeat } from '$domain/state';
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
 * Begins a game. Starting a new one over the top of an old one is legal and
 * is how both "rematch" and "new game" work — the previous game stays in the
 * log (ADR 0005).
 *
 * The config arrives whole rather than being derived from a format name.
 * Starting life and commander damage are what a game actually runs on, and
 * they were always fields of their own; a preset is a way of filling them in,
 * not a mode they live inside. That is also why nothing in here needs to know
 * what presets exist.
 */
export const startGame =
  (deps: { session: GameSession; ids: IdSource }) =>
  async (config: GameConfig, requests: readonly SeatRequest[]) => {
    const players: PlayerSeat[] = requests.map((request) => ({
      id: request.id ?? (deps.ids.next() as PlayerSeat['id']),
      name: request.name,
      colour: request.colour
    }));

    return deps.session.record({ kind: 'game/started', config, players });
  };
