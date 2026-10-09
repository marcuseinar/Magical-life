import { describe, expect, it } from 'vitest';
import { summariseGame } from './summary';
import { playerId } from './ids';
import type { EventBody } from './events';
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

const threeUp = started(commanderConfig, [
  seat(ANNA, 'Anna'),
  seat(BJORN, 'Björn'),
  seat(CARA, 'Cara')
]);

const out = (target: typeof ANNA): EventBody => ({ kind: 'player/eliminated', target });
const back = (target: typeof ANNA): EventBody => ({ kind: 'player/restored', target });
const life = (target: typeof ANNA, delta: number): EventBody => ({
  kind: 'life/changed',
  target,
  delta
});
const hit = (target: typeof ANNA, from: typeof ANNA, delta: number): EventBody => ({
  kind: 'commander/damaged',
  target,
  from,
  delta
});

const game = (bodies: EventBody[]) => makeLog('host', [threeUp, ...bodies]);

describe('post-game summary', () => {
  it('has nothing to summarise before a game exists', () => {
    expect(summariseGame([])).toBeNull();
  });

  it('passes over anything logged before the game began', () => {
    const early = makeLog('host', [out(BJORN)]);
    const summary = summariseGame([
      ...early,
      ...makeLog('host', [threeUp, out(BJORN), out(CARA)], 1)
    ]);
    expect(summary?.winner).toBe(ANNA);
  });

  it('has nothing to summarise while more than one player is still in', () => {
    expect(summariseGame(game([life(BJORN, -40), out(BJORN)]))).toBeNull();
  });

  it('never ends a game of one, however low it goes', () => {
    const solo = makeLog('host', [
      started(standardConfig, [seat(ANNA, 'Anna')]),
      life(ANNA, -20),
      out(ANNA)
    ]);
    expect(summariseGame(solo)).toBeNull();
  });

  it('ends the game when the last opponent goes out, and names who is left', () => {
    const summary = summariseGame(game([life(BJORN, -40), out(BJORN), life(CARA, -40), out(CARA)]));

    expect(summary?.winner).toBe(ANNA);
    expect(summary?.placings.map((placing) => [placing.place, placing.player])).toEqual([
      [1, ANNA],
      [2, CARA],
      [3, BJORN]
    ]);
  });

  /*
   * The end is derived, not recorded: undoing or reversing the last "Out"
   * has to put the game back in play without anybody tidying up an "ended"
   * event that no longer applies.
   */
  it('reopens the game when the last elimination is walked back', () => {
    const reversed = game([out(BJORN), out(CARA), back(CARA)]);
    expect(summariseGame(reversed)).toBeNull();

    const ending = game([out(BJORN), out(CARA)]);
    const undone = [
      ...ending,
      ...makeLog('host', [{ kind: 'event/retracted', retracts: ending.at(-1)!.id }], 10)
    ];
    expect(summariseGame(undone)).toBeNull();
  });

  it('places a player by their latest time out, not their first', () => {
    const summary = summariseGame(game([out(BJORN), back(BJORN), out(CARA), out(BJORN)]));
    expect(summary?.placings.map((placing) => placing.player)).toEqual([ANNA, BJORN, CARA]);
  });

  it('says what took each player out, as it stood when they went', () => {
    const summary = summariseGame(
      game([
        { kind: 'counter/changed', target: BJORN, counter: 'poison', delta: 10 },
        out(BJORN),
        life(CARA, -21),
        hit(CARA, ANNA, 21),
        out(CARA),
        // After the fact, and not what put Cara out.
        { kind: 'counter/changed', target: CARA, counter: 'poison', delta: 10 }
      ])
    );

    const reasonsOf = (id: typeof ANNA) =>
      summary?.placings.find((placing) => placing.player === id)?.reasons;
    expect(reasonsOf(ANNA)).toEqual([]);
    expect(reasonsOf(BJORN)).toEqual(['poison']);
    expect(reasonsOf(CARA)).toEqual(['commander']);
  });

  it('names the commander that hit each player hardest', () => {
    const summary = summariseGame(
      game([hit(ANNA, CARA, 6), hit(BJORN, CARA, 14), hit(BJORN, ANNA, 9), out(BJORN), out(CARA)])
    );

    const worst = (id: typeof ANNA) =>
      summary?.placings.find((placing) => placing.player === id)?.worstCommander;
    expect(worst(ANNA)).toEqual({ from: CARA, damage: 6 });
    expect(worst(BJORN)).toEqual({ from: CARA, damage: 14 });
    expect(worst(CARA)).toBeNull();
  });

  it('times the game from its start to the elimination that ended it', () => {
    const events = game([life(ANNA, -1), out(BJORN), out(CARA), life(ANNA, 5)]);
    const summary = summariseGame(events);

    expect(summary?.startedAt).toBe(events[0]!.at);
    expect(summary?.endedAt).toBe(events[3]!.at);
    expect(summary?.endedBy).toBe(events[3]!.id);
  });

  it('summarises only the game on screen, not the one before it', () => {
    const first = game([out(BJORN), out(CARA)]);
    const rematch = makeLog('host', [threeUp, out(ANNA)], 20);

    expect(summariseGame([...first, ...rematch])).toBeNull();
  });

  /*
   * Two devices can each mark somebody out at the same moment, leaving
   * nobody standing. That is still a finished game, with no winner rather
   * than a made-up one.
   */
  it('ends with no winner when the last two go out together', () => {
    const fromHost = makeLog('host', [threeUp, out(BJORN)]);
    const fromAnna = makeLog('anna', [out(ANNA)], 2);
    const fromCara = makeLog('cara', [out(CARA)], 2);

    const summary = summariseGame([...fromHost, ...fromAnna, ...fromCara]);

    expect(summary?.winner).toBeNull();
    expect(summary?.placings.map((placing) => placing.place)).toEqual([1, 2, 3]);
    expect(summary?.placings.at(-1)?.player).toBe(BJORN);
  });

  it('ignores an elimination aimed at nobody at the table', () => {
    const summary = summariseGame(game([out(playerId('ghost')), out(BJORN), out(CARA)]));
    expect(summary?.placings.map((placing) => placing.player)).toEqual([ANNA, CARA, BJORN]);
  });
});
