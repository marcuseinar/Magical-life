import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { fold, orderEvents } from '$domain/reducer';
import { COUNTER_KINDS, FLAG_KINDS, MANA_COLOURS } from '$domain/rules';
import type { CounterKind, FlagKind } from '$domain/rules';
import { eventId, playerId } from '$domain/ids';
import type { GameEvent } from '$domain/events';
import type { GameConfig, PlayerSeat } from '$domain/state';

/**
 * These are the properties that must hold for *every* possible history.
 * `fold` being commutative under merge is what makes peer-to-peer play correct;
 * it is worth more than any number of hand-written examples.
 */

type Action =
  | { t: 'life'; p: number; d: number }
  | { t: 'counter'; p: number; c: CounterKind; d: number }
  | { t: 'flag'; f: FlagKind; p: number | null }
  | { t: 'eliminate'; p: number }
  | { t: 'restore'; p: number }
  | { t: 'claim'; p: number }
  | { t: 'release'; p: number }
  | { t: 'end'; p: number | null };

const arbAction: fc.Arbitrary<Action> = fc.oneof(
  fc.record({
    t: fc.constant('life' as const),
    p: fc.nat(5),
    d: fc.integer({ min: -60, max: 60 })
  }),
  fc.record({
    t: fc.constant('counter' as const),
    p: fc.nat(5),
    c: fc.constantFrom(...COUNTER_KINDS),
    d: fc.integer({ min: -12, max: 12 })
  }),
  fc.record({
    t: fc.constant('flag' as const),
    f: fc.constantFrom(...FLAG_KINDS),
    p: fc.option(fc.nat(5), { nil: null })
  }),
  fc.record({ t: fc.constant('eliminate' as const), p: fc.nat(5) }),
  fc.record({ t: fc.constant('restore' as const), p: fc.nat(5) }),
  fc.record({ t: fc.constant('claim' as const), p: fc.nat(5) }),
  fc.record({ t: fc.constant('release' as const), p: fc.nat(5) }),
  fc.record({ t: fc.constant('end' as const), p: fc.option(fc.nat(5), { nil: null }) })
);

const arbScenario = fc
  .record({
    playerCount: fc.integer({ min: 1, max: 6 }),
    startingLife: fc.constantFrom(20, 25, 30, 40),
    actions: fc.array(arbAction, { maxLength: 60 })
  })
  .map(({ playerCount, startingLife, actions }) => {
    const seats: PlayerSeat[] = Array.from({ length: playerCount }, (_, i) => ({
      id: playerId(`p${i}`),
      name: `Player ${i + 1}`,
      colour: MANA_COLOURS[i % MANA_COLOURS.length]!
    }));
    const config: GameConfig = { format: 'commander', startingLife, tracksCommanderDamage: true };
    const seatOf = (index: number) => seats[index % seats.length]!.id;

    const start: GameEvent = {
      kind: 'game/started',
      config,
      players: seats,
      id: eventId('host:0'),
      authorId: playerId('host'),
      seq: 0,
      at: 0,
      lamport: 0
    };

    // The affected player authors the event (ADR 0002), so authorship follows the target.
    const events: GameEvent[] = actions.map((action, i) => {
      const lamport = i + 1;
      const author = 'p' in action && action.p !== null ? seatOf(action.p) : seatOf(0);
      const envelope = {
        id: eventId(`${author}:${lamport}`),
        authorId: author,
        seq: lamport,
        at: lamport,
        lamport
      };
      switch (action.t) {
        case 'life':
          return { ...envelope, kind: 'life/changed', target: seatOf(action.p), delta: action.d };
        case 'counter':
          return {
            ...envelope,
            kind: 'counter/changed',
            target: seatOf(action.p),
            counter: action.c,
            delta: action.d
          };
        case 'flag':
          return {
            ...envelope,
            kind: 'flag/moved',
            flag: action.f,
            to: action.p === null ? null : seatOf(action.p)
          };
        case 'eliminate':
          return { ...envelope, kind: 'player/eliminated', target: seatOf(action.p) };
        case 'restore':
          return { ...envelope, kind: 'player/restored', target: seatOf(action.p) };
        case 'claim':
          return { ...envelope, kind: 'seat/claimed', target: seatOf(action.p) };
        case 'release':
          return { ...envelope, kind: 'seat/released', target: seatOf(action.p) };
        case 'end':
          return {
            ...envelope,
            kind: 'game/ended',
            winner: action.p === null ? null : seatOf(action.p)
          };
      }
    });

    return { seats, config, log: [start, ...events], actions };
  });

const shuffled = <T>(items: readonly T[], seed: number): T[] => {
  const out = [...items];
  let state = seed || 1;
  for (let i = out.length - 1; i > 0; i--) {
    state = (state * 1664525 + 1013904223) >>> 0;
    const j = state % (i + 1);
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
};

describe('fold', () => {
  it('does not depend on the order events arrive in', () => {
    fc.assert(
      fc.property(arbScenario, fc.integer(), ({ log }, seed) => {
        expect(fold(shuffled(log, seed))).toEqual(fold(log));
      })
    );
  });

  it('is idempotent — replaying a log changes nothing', () => {
    fc.assert(
      fc.property(arbScenario, ({ log }) => {
        expect(fold([...log, ...log])).toEqual(fold(log));
      })
    );
  });

  it('merges commutatively, which is what makes peer-to-peer correct', () => {
    fc.assert(
      fc.property(arbScenario, ({ log, seats }) => {
        const mine = log.filter((e) => e.authorId === seats[0]!.id || e.kind === 'game/started');
        const theirs = log.filter((e) => e.authorId !== seats[0]!.id);
        expect(fold([...mine, ...theirs])).toEqual(fold([...theirs, ...mine]));
      })
    );
  });

  it('only ever changes life by the sum of the life events aimed at that player', () => {
    fc.assert(
      fc.property(arbScenario, ({ log, seats, config }) => {
        const state = fold(log)!;
        for (const seat of seats) {
          const expected =
            config.startingLife +
            log
              .filter((e) => e.kind === 'life/changed' && e.target === seat.id)
              .reduce((total, e) => total + (e.kind === 'life/changed' ? e.delta : 0), 0);
          expect(state.players.find((p) => p.id === seat.id)!.life).toBe(expected);
        }
      })
    );
  });

  it('keeps every life total a finite integer', () => {
    fc.assert(
      fc.property(arbScenario, ({ log }) => {
        for (const player of fold(log)!.players) expect(Number.isInteger(player.life)).toBe(true);
      })
    );
  });

  it('never lets a counter go negative', () => {
    fc.assert(
      fc.property(arbScenario, ({ log }) => {
        for (const player of fold(log)!.players) {
          for (const kind of COUNTER_KINDS) expect(player.counters[kind]).toBeGreaterThanOrEqual(0);
        }
      })
    );
  });

  it('seats exactly the players it was given, in order', () => {
    fc.assert(
      fc.property(arbScenario, ({ log, seats }) => {
        expect(fold(log)!.players.map((p) => p.id)).toEqual(seats.map((s) => s.id));
      })
    );
  });

  it('leaves state as if a retracted event had never been appended', () => {
    fc.assert(
      fc.property(arbScenario, fc.nat(), ({ log }, pick) => {
        const undoable = log.filter((e) => e.kind !== 'game/started');
        fc.pre(undoable.length > 0);
        const victim = undoable[pick % undoable.length]!;

        const retraction: GameEvent = {
          kind: 'event/retracted',
          retracts: victim.id,
          id: eventId('undo:9999'),
          authorId: playerId('undo'),
          seq: 9999,
          at: 9999,
          lamport: 9999
        };

        expect(fold([...log, retraction])).toEqual(fold(log.filter((e) => e.id !== victim.id)));
      })
    );
  });
});

describe('orderEvents', () => {
  it('produces the same total order on every device', () => {
    fc.assert(
      fc.property(arbScenario, fc.integer(), fc.integer(), ({ log }, a, b) => {
        expect(orderEvents(shuffled(log, a)).map((e) => e.id)).toEqual(
          orderEvents(shuffled(log, b)).map((e) => e.id)
        );
      })
    );
  });

  it('removes duplicates', () => {
    fc.assert(
      fc.property(arbScenario, ({ log }) => {
        const ids = orderEvents([...log, ...log]).map((e) => e.id);
        expect(new Set(ids).size).toBe(ids.length);
      })
    );
  });
});
