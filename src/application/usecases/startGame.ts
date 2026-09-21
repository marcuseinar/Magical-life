import type { ManaColour } from '$domain/rules';
import type { PlayerId } from '$domain/ids';
import type { GameConfig, GameState, PlayerSeat } from '$domain/state';
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

/**
 * True when starting a game with `requests` would leave a currently claimed
 * seat out of the new roster — a strong signal the group of physical players
 * has actually changed, not just the format or the life total. `reduce`
 * already handles the seat itself correctly (it just isn't seated anymore),
 * but a *table* built for the old roster would otherwise carry on unchanged
 * under the joined device's old seat, with nothing telling that device it
 * has lost its place. The caller's cue to end that table rather than let it
 * keep offering seats to a game some of its players are no longer part of.
 */
export const dropsClaimedSeat = (
  current: GameState | null,
  requests: readonly SeatRequest[]
): boolean => {
  if (current === null) return false;
  const kept = new Set(requests.map((request) => request.id).filter((id) => id !== undefined));
  return current.players.some((player) => player.claimed && !kept.has(player.id));
};
