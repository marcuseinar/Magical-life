import { describe, expect, it } from 'vitest';
import {
  isLethal,
  lethalReasons,
  livingPlayers,
  localSeats,
  remoteSeats,
  threatLevel
} from './selectors';
import { LETHAL_POISON } from './rules';
import { fold } from './reducer';
import { playerId } from './ids';
import { ANNA, BJORN, commanderConfig, makeLog, seat, started } from '../../tests/support/events';
import type { GameState, PlayerState } from './state';

const player = (over: Partial<PlayerState> = {}): PlayerState => ({
  id: ANNA,
  name: 'Anna',
  colour: 'green',
  life: 40,
  counters: { poison: 0, energy: 0, experience: 0, rad: 0, ticket: 0 },
  commanderDamage: {},
  eliminated: false,
  claimed: false,
  ...over
});

describe('lethalReasons', () => {
  it('is empty for a healthy player', () => {
    expect(lethalReasons(player())).toEqual([]);
  });

  it('names life at zero', () => {
    expect(lethalReasons(player({ life: 0 }))).toEqual(['life']);
  });

  it('names life below zero', () => {
    expect(lethalReasons(player({ life: -7 }))).toEqual(['life']);
  });

  it('names poison at the threshold', () => {
    const poisoned = player({ counters: { ...player().counters, poison: LETHAL_POISON } });
    expect(lethalReasons(poisoned)).toEqual(['poison']);
  });

  it('does not name poison one short of the threshold', () => {
    const poisoned = player({ counters: { ...player().counters, poison: LETHAL_POISON - 1 } });
    expect(lethalReasons(poisoned)).toEqual([]);
  });

  it('names every reason that applies at once', () => {
    const doomed = player({
      life: 0,
      counters: { ...player().counters, poison: 12 },
      commanderDamage: { bjorn: 21 }
    });
    expect(lethalReasons(doomed)).toEqual(['life', 'poison', 'commander']);
  });

  it('names commander damage at twenty-one, on full life', () => {
    expect(lethalReasons(player({ commanderDamage: { bjorn: 21 } }))).toEqual(['commander']);
  });
});

describe('isLethal', () => {
  it('is false while the player is safe', () => {
    expect(isLethal(player())).toBe(false);
  });

  it('is true once any reason applies', () => {
    expect(isLethal(player({ life: 0 }))).toBe(true);
  });
});

describe('threatLevel', () => {
  it('is safe well above the line', () => {
    expect(threatLevel(player({ life: 20 }))).toBe('safe');
  });

  it('warns at five life or below', () => {
    expect(threatLevel(player({ life: 5 }))).toBe('warning');
  });

  it('warns at eight poison', () => {
    expect(threatLevel(player({ counters: { ...player().counters, poison: 8 } }))).toBe('warning');
  });

  it('is lethal at zero life', () => {
    expect(threatLevel(player({ life: 0 }))).toBe('lethal');
  });

  it('warns as a commander closes in, before it is lethal', () => {
    expect(threatLevel(player({ commanderDamage: { bjorn: 17 } }))).toBe('warning');
    expect(threatLevel(player({ commanderDamage: { bjorn: 16 } }))).toBe('safe');
  });

  it('is lethal at twenty-one from one commander, on full life', () => {
    expect(threatLevel(player({ commanderDamage: { bjorn: 21 } }))).toBe('lethal');
  });

  it('is lethal at ten poison even on full life', () => {
    const poisoned = player({ counters: { ...player().counters, poison: LETHAL_POISON } });
    expect(threatLevel(poisoned)).toBe('lethal');
  });
});

describe('livingPlayers', () => {
  it('excludes players who have been declared out', () => {
    const events = makeLog('anna', [
      started(commanderConfig, [seat(ANNA, 'Anna'), seat(BJORN, 'Björn')]),
      { kind: 'player/eliminated', target: ANNA }
    ]);
    const state = fold(events)!;
    expect(livingPlayers(state).map((p) => p.id)).toEqual([BJORN]);
  });
});

/*
 * Which seats this device plays. Both ends fold the same log, so the answer
 * has to come from who is asking as well as from the log: the host is not a
 * seat and plays everything nobody has taken, while a joiner is a seat and
 * plays exactly that one. Everything else, for either of them, is somebody
 * else's — and `remoteSeats` is the rest, so the two always partition the
 * table with nobody counted twice or dropped.
 */
describe('whose seat is whose', () => {
  const anna = player({ id: ANNA, name: 'Anna' });
  const bjorn = player({ id: BJORN, name: 'Björn' });
  const table = [anna, bjorn];
  const DEVICE = playerId('device');

  const state = (players: PlayerState[]): GameState => ({
    config: commanderConfig,
    players,
    flags: { monarch: null, initiative: null, citysBlessing: null },
    firstPlayer: null,
    ended: false,
    winner: null
  });

  it('gives an offline device every seat, because nobody else has one', () => {
    expect(localSeats(state(table), DEVICE)).toEqual(table);
    expect(remoteSeats(state(table), DEVICE)).toEqual([]);
  });

  it('takes a claimed seat away from the device that is not playing it', () => {
    const claimed = [anna, { ...bjorn, claimed: true }];

    expect(localSeats(state(claimed), DEVICE)).toEqual([anna]);
    expect(remoteSeats(state(claimed), DEVICE)).toEqual([{ ...bjorn, claimed: true }]);
  });

  it('gives a joiner their own seat and nothing else', () => {
    const claimed = [anna, { ...bjorn, claimed: true }];

    expect(localSeats(state(claimed), BJORN)).toEqual([{ ...bjorn, claimed: true }]);
    // Anna is unclaimed, but she is still not this device's to play.
    expect(remoteSeats(state(claimed), BJORN)).toEqual([anna]);
  });

  it('keeps the table whole: every seat is local or remote, never both', () => {
    for (const author of [DEVICE, ANNA, BJORN]) {
      const claimed = [anna, { ...bjorn, claimed: true }];
      const local = localSeats(state(claimed), author);
      const remote = remoteSeats(state(claimed), author);

      expect([...local, ...remote]).toHaveLength(claimed.length);
      expect(local.filter((seat) => remote.includes(seat))).toEqual([]);
    }
  });
});
