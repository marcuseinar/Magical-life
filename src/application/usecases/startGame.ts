import { FORMATS } from '$domain/rules';
import type { FormatId, ManaColour } from '$domain/rules';
import type { PlayerSeat } from '$domain/state';
import type { GameSession } from '../gameSession';
import type { IdSource } from '../ports/idSource';

export type SeatRequest = {
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
      id: deps.ids.next() as PlayerSeat['id'],
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
