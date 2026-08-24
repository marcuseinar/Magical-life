import { describe, expect, it } from 'vitest';
import { fold, orderEvents, reduce } from './reducer';
import { LETHAL_POISON } from './rules';
import { eventId, playerId } from './ids';
import type { GameEvent } from './events';
import {
  ANNA,
  BJORN,
  CARA,
  commanderConfig,
  makeLog,
  seat,
  standardConfig,
  started
} from '../../tests/support/events';

const anna = seat(ANNA, 'Anna');
const bjorn = seat(BJORN, 'Björn');

const newGame = (bodies: Parameters<typeof makeLog>[1] = []) =>
  makeLog('anna', [started(commanderConfig, [anna, bjorn]), ...bodies]);

const lifeOf = (events: GameEvent[], id = ANNA) =>
  fold(events)?.players.find((p) => p.id === id)?.life;

describe('fold', () => {
  it('is null before a game has started', () => {
    expect(fold([])).toBeNull();
  });

  it('ignores events that arrive before the game starts', () => {
    const orphan = makeLog('anna', [{ kind: 'life/changed', target: ANNA, delta: -3 }]);
    expect(fold(orphan)).toBeNull();
  });

  it('seats every player at the format starting life', () => {
    const state = fold(newGame());
    expect(state?.players.map((p) => p.life)).toEqual([40, 40]);
    expect(state?.players.map((p) => p.name)).toEqual(['Anna', 'Björn']);
    expect(state?.config.startingLife).toBe(40);
  });

  it('starts a new game over the top of an old one', () => {
    const events = [
      ...newGame([{ kind: 'life/changed', target: ANNA, delta: -12 }]),
      ...makeLog('anna', [started(standardConfig, [anna, bjorn])], 100)
    ];
    expect(lifeOf(events)).toBe(20);
  });
});

describe('life', () => {
  it('applies a delta to the named player only', () => {
    const events = newGame([{ kind: 'life/changed', target: ANNA, delta: -13 }]);
    expect(lifeOf(events, ANNA)).toBe(27);
    expect(lifeOf(events, BJORN)).toBe(40);
  });

  it('accumulates repeated deltas', () => {
    const events = newGame([
      { kind: 'life/changed', target: ANNA, delta: -13 },
      { kind: 'life/changed', target: ANNA, delta: +5 },
      { kind: 'life/changed', target: ANNA, delta: -2 }
    ]);
    expect(lifeOf(events)).toBe(30);
  });

  it('goes below zero, because players sit at negative life while effects resolve', () => {
    const events = newGame([{ kind: 'life/changed', target: ANNA, delta: -45 }]);
    expect(lifeOf(events)).toBe(-5);
  });

  it('ignores a delta aimed at a player who is not in the game', () => {
    const events = newGame([{ kind: 'life/changed', target: CARA, delta: -5 }]);
    expect(fold(events)?.players.map((p) => p.life)).toEqual([40, 40]);
  });
});

describe('counters', () => {
  it('adds counters of each kind independently', () => {
    const events = newGame([
      { kind: 'counter/changed', target: ANNA, counter: 'poison', delta: 3 },
      { kind: 'counter/changed', target: ANNA, counter: 'energy', delta: 7 }
    ]);
    const player = fold(events)?.players[0];
    expect(player?.counters.poison).toBe(3);
    expect(player?.counters.energy).toBe(7);
    expect(player?.counters.rad).toBe(0);
  });

  it('never goes negative — you cannot have minus one poison', () => {
    const events = newGame([
      { kind: 'counter/changed', target: ANNA, counter: 'poison', delta: 2 },
      { kind: 'counter/changed', target: ANNA, counter: 'poison', delta: -5 }
    ]);
    expect(fold(events)?.players[0]?.counters.poison).toBe(0);
  });

  it('ignores a counter aimed at a player who is not in the game', () => {
    const events = newGame([
      { kind: 'counter/changed', target: CARA, counter: 'poison', delta: 3 }
    ]);
    expect(fold(events)?.players[0]?.counters.poison).toBe(0);
  });
});

describe('flags', () => {
  it('has no holder at the start of a game', () => {
    expect(fold(newGame())?.flags.monarch).toBeNull();
  });

  it('is held by exactly one player at a time', () => {
    const events = newGame([
      { kind: 'flag/moved', flag: 'monarch', to: ANNA },
      { kind: 'flag/moved', flag: 'monarch', to: BJORN }
    ]);
    expect(fold(events)?.flags.monarch).toBe(BJORN);
  });

  it('can be given up entirely', () => {
    const events = newGame([
      { kind: 'flag/moved', flag: 'monarch', to: ANNA },
      { kind: 'flag/moved', flag: 'monarch', to: null }
    ]);
    expect(fold(events)?.flags.monarch).toBeNull();
  });

  it('tracks each flag separately', () => {
    const events = newGame([
      { kind: 'flag/moved', flag: 'monarch', to: ANNA },
      { kind: 'flag/moved', flag: 'initiative', to: BJORN }
    ]);
    const flags = fold(events)?.flags;
    expect(flags?.monarch).toBe(ANNA);
    expect(flags?.initiative).toBe(BJORN);
    expect(flags?.citysBlessing).toBeNull();
  });
});

describe('elimination', () => {
  it('is explicit, not automatic — nobody is out just for being at zero', () => {
    const events = newGame([{ kind: 'life/changed', target: ANNA, delta: -40 }]);
    expect(fold(events)?.players[0]?.eliminated).toBe(false);
  });

  it('is recorded when declared', () => {
    const events = newGame([
      { kind: 'life/changed', target: ANNA, delta: -40 },
      { kind: 'player/eliminated', target: ANNA }
    ]);
    expect(fold(events)?.players[0]?.eliminated).toBe(true);
  });

  it('can be reversed, because people declare it too early', () => {
    const events = newGame([
      { kind: 'player/eliminated', target: ANNA },
      { kind: 'player/restored', target: ANNA }
    ]);
    expect(fold(events)?.players[0]?.eliminated).toBe(false);
  });

  it('ignores elimination of a player who is not in the game', () => {
    const events = newGame([{ kind: 'player/eliminated', target: CARA }]);
    expect(fold(events)?.players.every((p) => !p.eliminated)).toBe(true);
  });
});

describe('who goes first', () => {
  it('is nobody until it is decided', () => {
    expect(fold(newGame())?.firstPlayer).toBeNull();
  });

  it('is recorded once chosen', () => {
    const events = newGame([{ kind: 'turn/firstPlayer', target: BJORN }]);
    expect(fold(events)?.firstPlayer).toBe(BJORN);
  });

  it('can be rolled again', () => {
    const events = newGame([
      { kind: 'turn/firstPlayer', target: BJORN },
      { kind: 'turn/firstPlayer', target: ANNA }
    ]);
    expect(fold(events)?.firstPlayer).toBe(ANNA);
  });

  it('ignores a player who is not in the game', () => {
    const events = newGame([{ kind: 'turn/firstPlayer', target: CARA }]);
    expect(fold(events)?.firstPlayer).toBeNull();
  });

  it('is forgotten when a new game starts', () => {
    const events = [
      ...newGame([{ kind: 'turn/firstPlayer', target: BJORN }]),
      ...makeLog('anna', [started(commanderConfig, [anna, bjorn])], 100)
    ];
    expect(fold(events)?.firstPlayer).toBeNull();
  });
});

describe('game end', () => {
  it('is not ended by default', () => {
    const state = fold(newGame());
    expect(state?.ended).toBe(false);
    expect(state?.winner).toBeNull();
  });

  it('records a winner', () => {
    const events = newGame([{ kind: 'game/ended', winner: BJORN }]);
    expect(fold(events)?.ended).toBe(true);
    expect(fold(events)?.winner).toBe(BJORN);
  });

  it('records a draw', () => {
    const events = newGame([{ kind: 'game/ended', winner: null }]);
    expect(fold(events)?.ended).toBe(true);
    expect(fold(events)?.winner).toBeNull();
  });
});

describe('retraction', () => {
  it('undoes the referenced event exactly', () => {
    const log = newGame([
      { kind: 'life/changed', target: ANNA, delta: -13 },
      { kind: 'life/changed', target: ANNA, delta: -5 }
    ]);
    const undo = makeLog('anna', [{ kind: 'event/retracted', retracts: eventId('anna:2') }], 50);
    expect(lifeOf([...log, ...undo])).toBe(27);
  });

  it('leaves state identical to the event never having happened', () => {
    const withoutIt = newGame([{ kind: 'life/changed', target: ANNA, delta: -13 }]);
    const withUndo = [
      ...newGame([
        { kind: 'life/changed', target: ANNA, delta: -13 },
        { kind: 'life/changed', target: ANNA, delta: -5 }
      ]),
      ...makeLog('anna', [{ kind: 'event/retracted', retracts: eventId('anna:2') }], 50)
    ];
    expect(fold(withUndo)).toEqual(fold(withoutIt));
  });

  it('is inert when it names an event that is not in the log', () => {
    const events = [
      ...newGame([{ kind: 'life/changed', target: ANNA, delta: -13 }]),
      ...makeLog('anna', [{ kind: 'event/retracted', retracts: eventId('nobody:9') }], 50)
    ];
    expect(lifeOf(events)).toBe(27);
  });

  it('cannot itself be retracted — redo is a new forward event', () => {
    const events = [
      ...newGame([{ kind: 'life/changed', target: ANNA, delta: -13 }]),
      ...makeLog('anna', [{ kind: 'event/retracted', retracts: eventId('anna:1') }], 50),
      ...makeLog('anna', [{ kind: 'event/retracted', retracts: eventId('anna:50') }], 60)
    ];
    expect(lifeOf(events)).toBe(40);
  });
});

describe('ordering and merge', () => {
  it('orders by lamport clock, not by arrival', () => {
    const log = newGame();
    const late = makeLog('anna', [{ kind: 'life/changed', target: ANNA, delta: -10 }], 5);
    const shuffled = [...late, ...log];
    expect(lifeOf(shuffled)).toBe(30);
  });

  it('breaks lamport ties by author, so every device agrees', () => {
    const base = newGame();
    const fromAnna = makeLog('anna', [{ kind: 'game/ended', winner: ANNA }], 10);
    const fromBjorn = makeLog('bjorn', [{ kind: 'game/ended', winner: BJORN }], 10);
    const one = fold([...base, ...fromAnna, ...fromBjorn]);
    const other = fold([...base, ...fromBjorn, ...fromAnna]);
    expect(one).toEqual(other);
    expect(one?.winner).toBe(BJORN);
  });

  it('is idempotent — replaying the same event changes nothing', () => {
    const events = newGame([{ kind: 'life/changed', target: ANNA, delta: -13 }]);
    expect(fold([...events, ...events])).toEqual(fold(events));
  });

  it('falls back to sequence when one author writes twice at the same lamport', () => {
    const base = newGame();
    const seqs = [7, 3];
    const [first, second] = makeLog('anna', [
      { kind: 'life/changed', target: ANNA, delta: -1 },
      { kind: 'life/changed', target: ANNA, delta: -2 }
    ]).map((event, index) => ({
      ...event,
      lamport: 9,
      seq: seqs[index]!,
      id: eventId(`anna:${seqs[index]}`)
    }));

    const ordered = orderEvents([...base, first!, second!]);
    expect(ordered.map((e) => e.seq)).toEqual([0, 3, 7]);
  });

  it('sorts a duplicate-free log deterministically', () => {
    const events = newGame([{ kind: 'life/changed', target: ANNA, delta: -1 }]);
    expect(orderEvents([...events].reverse()).map((e) => e.id)).toEqual(events.map((e) => e.id));
  });
});

describe('reduce', () => {
  it('returns null state untouched for a non-start event', () => {
    const [event] = makeLog('anna', [{ kind: 'life/changed', target: ANNA, delta: -1 }]);
    expect(reduce(null, event!)).toBeNull();
  });

  it('treats a retraction as a no-op, because fold has already handled it', () => {
    const state = fold(newGame());
    const [event] = makeLog('anna', [{ kind: 'event/retracted', retracts: eventId('x') }]);
    expect(reduce(state, event!)).toBe(state);
  });
});

describe('poison', () => {
  it('reaches the lethal threshold at ten', () => {
    const events = newGame([
      { kind: 'counter/changed', target: ANNA, counter: 'poison', delta: LETHAL_POISON }
    ]);
    expect(fold(events)?.players[0]?.counters.poison).toBe(LETHAL_POISON);
  });
});

describe('player identity', () => {
  it('keeps seats in the order they were given', () => {
    const events = makeLog('anna', [
      started(standardConfig, [seat(playerId('c'), 'C'), seat(playerId('a'), 'A')])
    ]);
    expect(fold(events)?.players.map((p) => p.id)).toEqual(['c', 'a']);
  });
});
