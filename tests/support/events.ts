import type { GameEvent, EventBody } from '$domain/events';
import { eventId, playerId } from '$domain/ids';
import type { PlayerId } from '$domain/ids';
import type { GameConfig, PlayerSeat } from '$domain/state';

/** Deterministic event construction for tests. Real events come from a use case. */
export function makeLog(author: string, bodies: EventBody[], startLamport = 0): GameEvent[] {
  return bodies.map((body, index) => {
    const seq = startLamport + index;
    return {
      ...body,
      // Ids must stay unique across separate calls, or merge tests silently dedupe.
      id: eventId(`${author}:${seq}`),
      authorId: playerId(author),
      seq,
      at: 1_700_000_000_000 + seq,
      lamport: seq
    };
  });
}

export const ANNA = playerId('anna');
export const BJORN = playerId('bjorn');
export const CARA = playerId('cara');

export const seat = (id: PlayerId, name: string): PlayerSeat => ({
  id,
  name,
  colour: 'green'
});

export const commanderConfig: GameConfig = {
  format: 'commander',
  startingLife: 40,
  tracksCommanderDamage: true
};

export const standardConfig: GameConfig = {
  format: 'standard',
  startingLife: 20,
  tracksCommanderDamage: false
};

export const started = (config: GameConfig, seats: PlayerSeat[]): EventBody => ({
  kind: 'game/started',
  config,
  players: seats
});
