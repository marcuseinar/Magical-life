import { describe, expect, it } from 'vitest';
import { fold } from './reducer';
import { LETHAL_COMMANDER_DAMAGE } from './rules';
import { commanderDamageFrom, highestCommanderDamage, lethalReasons } from './selectors';
import { playerId } from './ids';
import {
  ANNA,
  BJORN,
  CARA,
  commanderConfig,
  makeLog,
  seat,
  started
} from '../../tests/support/events';

const annaSeat = seat(ANNA, 'Anna');
const bjornSeat = seat(BJORN, 'Björn');
const caraSeat = seat(CARA, 'Cara');

const newGame = (bodies: Parameters<typeof makeLog>[1] = []) =>
  makeLog('host', [started(commanderConfig, [annaSeat, bjornSeat, caraSeat]), ...bodies]);

const annaAfter = (bodies: Parameters<typeof makeLog>[1]) =>
  fold(newGame(bodies))!.players.find((player) => player.id === ANNA)!;

describe('commander damage', () => {
  it('starts at nothing from anybody', () => {
    expect(annaAfter([]).commanderDamage).toEqual({});
    expect(highestCommanderDamage(annaAfter([]))).toBe(0);
  });

  it('records damage from one commander', () => {
    const anna = annaAfter([{ kind: 'commander/damaged', target: ANNA, from: BJORN, delta: 7 }]);
    expect(commanderDamageFrom(anna, BJORN)).toBe(7);
  });

  it('accumulates across attacks', () => {
    const anna = annaAfter([
      { kind: 'commander/damaged', target: ANNA, from: BJORN, delta: 7 },
      { kind: 'commander/damaged', target: ANNA, from: BJORN, delta: 6 }
    ]);
    expect(commanderDamageFrom(anna, BJORN)).toBe(13);
  });

  it('keeps each commander separate, because twenty-one is per commander', () => {
    const anna = annaAfter([
      { kind: 'commander/damaged', target: ANNA, from: BJORN, delta: 13 },
      { kind: 'commander/damaged', target: ANNA, from: CARA, delta: 11 }
    ]);
    expect(commanderDamageFrom(anna, BJORN)).toBe(13);
    expect(commanderDamageFrom(anna, CARA)).toBe(11);
    // Twenty-four in total, but neither commander has landed a lethal blow.
    expect(lethalReasons(anna)).toEqual([]);
  });

  it('can be corrected downwards without going negative', () => {
    const anna = annaAfter([
      { kind: 'commander/damaged', target: ANNA, from: BJORN, delta: 3 },
      { kind: 'commander/damaged', target: ANNA, from: BJORN, delta: -9 }
    ]);
    expect(commanderDamageFrom(anna, BJORN)).toBe(0);
  });

  it('counts damage from a commander its owner no longer controls', () => {
    // A stolen commander still deals commander damage, and it is still its
    // owner's commander doing it.
    const anna = annaAfter([{ kind: 'commander/damaged', target: ANNA, from: ANNA, delta: 21 }]);
    expect(commanderDamageFrom(anna, ANNA)).toBe(21);
    expect(lethalReasons(anna)).toContain('commander');
  });

  it('ignores damage aimed at somebody not in the game', () => {
    const state = fold(
      newGame([{ kind: 'commander/damaged', target: playerId('ghost'), from: BJORN, delta: 5 }])
    )!;
    expect(state.players.every((player) => highestCommanderDamage(player) === 0)).toBe(true);
  });

  it('ignores damage from somebody not in the game', () => {
    const anna = annaAfter([
      { kind: 'commander/damaged', target: ANNA, from: playerId('ghost'), delta: 5 }
    ]);
    expect(anna.commanderDamage).toEqual({});
  });

  it('is forgotten when a new game starts', () => {
    const events = [
      ...newGame([{ kind: 'commander/damaged', target: ANNA, from: BJORN, delta: 13 }]),
      ...makeLog('host', [started(commanderConfig, [annaSeat, bjornSeat, caraSeat])], 100)
    ];
    const anna = fold(events)!.players.find((player) => player.id === ANNA)!;
    expect(anna.commanderDamage).toEqual({});
  });
});

describe('lethal commander damage', () => {
  it('is not lethal one short of the threshold', () => {
    const anna = annaAfter([
      { kind: 'commander/damaged', target: ANNA, from: BJORN, delta: LETHAL_COMMANDER_DAMAGE - 1 }
    ]);
    expect(lethalReasons(anna)).toEqual([]);
  });

  it('is lethal at the threshold, on full life', () => {
    const anna = annaAfter([
      { kind: 'commander/damaged', target: ANNA, from: BJORN, delta: LETHAL_COMMANDER_DAMAGE }
    ]);
    expect(anna.life).toBe(40);
    expect(lethalReasons(anna)).toEqual(['commander']);
  });

  it('names every reason at once', () => {
    const anna = annaAfter([
      { kind: 'life/changed', target: ANNA, delta: -40 },
      { kind: 'counter/changed', target: ANNA, counter: 'poison', delta: 10 },
      { kind: 'commander/damaged', target: ANNA, from: BJORN, delta: 21 }
    ]);
    expect(lethalReasons(anna)).toEqual(['life', 'poison', 'commander']);
  });

  it('reports the worst single commander, not the total', () => {
    const anna = annaAfter([
      { kind: 'commander/damaged', target: ANNA, from: BJORN, delta: 13 },
      { kind: 'commander/damaged', target: ANNA, from: CARA, delta: 18 }
    ]);
    expect(highestCommanderDamage(anna)).toBe(18);
  });
});
