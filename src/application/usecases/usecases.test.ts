import { beforeEach, describe, expect, it } from 'vitest';
import { createGameSession } from '../gameSession';
import type { GameSession } from '../gameSession';
import { createMemoryEventLog } from '$adapters/storage/memoryEventLog';
import { playerId } from '$domain/ids';
import type { PlayerId } from '$domain/ids';
import { fakeClock, countingIdSource } from '../../../tests/support/fakes';
import { startGame } from './startGame';
import { applyLifeDelta } from './applyLifeDelta';
import { changeCounter } from './changeCounter';
import { moveFlag } from './moveFlag';
import { setElimination } from './setElimination';
import { undoLast } from './undoLast';
import { chooseFirstPlayer } from './chooseFirstPlayer';
import { rematch } from './rematch';
import { recordCommanderDamage } from './recordCommanderDamage';
import { commanderDamageFrom } from '$domain/selectors';
import type { Rng } from '../ports/rng';

/** A dealt sequence of "random" numbers, so a roll is a fact and not a coin toss. */
const fixedRng = (...values: number[]): Rng => {
  let index = 0;
  return { next: () => values[index++ % values.length]! };
};

const HOST = playerId('host');

describe('use cases', () => {
  let session: GameSession;
  let seats: readonly PlayerId[];

  const newGame = () =>
    startGame({ session, ids: countingIdSource() })('commander', [
      { name: 'Anna', colour: 'green' },
      { name: 'Björn', colour: 'blue' }
    ]);

  beforeEach(async () => {
    session = createGameSession({
      clock: fakeClock(),
      log: createMemoryEventLog(),
      authorId: HOST
    });
    await newGame();
    seats = session.state!.players.map((p) => p.id);
  });

  describe('startGame', () => {
    it('seats players at the format starting life', () => {
      expect(session.state?.players.map((p) => p.life)).toEqual([40, 40]);
      expect(session.state?.config.format).toBe('commander');
      expect(session.state?.config.tracksCommanderDamage).toBe(true);
    });

    it('honours an overridden starting life', async () => {
      await startGame({ session, ids: countingIdSource('x') })(
        'commander',
        [{ name: 'Solo', colour: 'red' }],
        60
      );
      expect(session.state?.players[0]?.life).toBe(60);
    });

    it('starts a rematch without erasing the old game from the log', async () => {
      await applyLifeDelta({ session })(seats[0]!, -10);
      const before = session.events.length;
      await newGame();
      expect(session.state?.players[0]?.life).toBe(40);
      expect(session.events.length).toBeGreaterThan(before);
    });
  });

  describe('applyLifeDelta', () => {
    it('records a single event for an accumulated delta', async () => {
      const result = await applyLifeDelta({ session })(seats[0]!, -7);
      expect(result.ok).toBe(true);
      expect(session.state?.players[0]?.life).toBe(33);
      expect(session.events.filter((e) => e.kind === 'life/changed')).toHaveLength(1);
    });

    it('refuses a delta of zero rather than writing a pointless event', async () => {
      const result = await applyLifeDelta({ session })(seats[0]!, 0);
      expect(result).toEqual({ ok: false, error: 'no-change' });
    });

    it('refuses a fractional delta', async () => {
      const result = await applyLifeDelta({ session })(seats[0]!, 1.5);
      expect(result).toEqual({ ok: false, error: 'not-an-integer' });
    });

    it('refuses a player who is not in the game', async () => {
      const result = await applyLifeDelta({ session })(playerId('ghost'), -1);
      expect(result).toEqual({ ok: false, error: 'unknown-player' });
    });

    it('refuses when no game has started', async () => {
      const empty = createGameSession({
        clock: fakeClock(),
        log: createMemoryEventLog(),
        authorId: HOST
      });
      const result = await applyLifeDelta({ session: empty })(seats[0]!, -1);
      expect(result).toEqual({ ok: false, error: 'no-game' });
    });
  });

  describe('changeCounter', () => {
    it('adds poison', async () => {
      await changeCounter({ session })(seats[0]!, 'poison', 3);
      expect(session.state?.players[0]?.counters.poison).toBe(3);
    });

    it('refuses to decrement a counter that is already zero', async () => {
      const result = await changeCounter({ session })(seats[0]!, 'poison', -1);
      expect(result).toEqual({ ok: false, error: 'no-change' });
      expect(session.events.filter((e) => e.kind === 'counter/changed')).toHaveLength(0);
    });

    it('refuses a delta of zero', async () => {
      expect(await changeCounter({ session })(seats[0]!, 'poison', 0)).toEqual({
        ok: false,
        error: 'no-change'
      });
    });

    it('refuses a fractional delta', async () => {
      expect(await changeCounter({ session })(seats[0]!, 'energy', 0.5)).toEqual({
        ok: false,
        error: 'not-an-integer'
      });
    });

    it('refuses an unknown player', async () => {
      expect(await changeCounter({ session })(playerId('ghost'), 'poison', 1)).toEqual({
        ok: false,
        error: 'unknown-player'
      });
    });

    it('refuses when no game has started', async () => {
      const empty = createGameSession({
        clock: fakeClock(),
        log: createMemoryEventLog(),
        authorId: HOST
      });
      expect(await changeCounter({ session: empty })(seats[0]!, 'poison', 1)).toEqual({
        ok: false,
        error: 'no-game'
      });
    });
  });

  describe('moveFlag', () => {
    it('gives the monarchy to a player', async () => {
      await moveFlag({ session })('monarch', seats[1]!);
      expect(session.state?.flags.monarch).toBe(seats[1]);
    });

    it('takes it away again', async () => {
      await moveFlag({ session })('monarch', seats[1]!);
      await moveFlag({ session })('monarch', null);
      expect(session.state?.flags.monarch).toBeNull();
    });

    it('refuses to hand it to the player who already holds it', async () => {
      await moveFlag({ session })('monarch', seats[0]!);
      expect(await moveFlag({ session })('monarch', seats[0]!)).toEqual({
        ok: false,
        error: 'no-change'
      });
    });

    it('refuses an unknown player', async () => {
      expect(await moveFlag({ session })('monarch', playerId('ghost'))).toEqual({
        ok: false,
        error: 'unknown-player'
      });
    });

    it('refuses when no game has started', async () => {
      const empty = createGameSession({
        clock: fakeClock(),
        log: createMemoryEventLog(),
        authorId: HOST
      });
      expect(await moveFlag({ session: empty })('monarch', null)).toEqual({
        ok: false,
        error: 'no-game'
      });
    });
  });

  describe('setElimination', () => {
    it('declares a player out', async () => {
      await setElimination({ session })(seats[0]!, true);
      expect(session.state?.players[0]?.eliminated).toBe(true);
    });

    it('brings them back, because people call it too early', async () => {
      await setElimination({ session })(seats[0]!, true);
      await setElimination({ session })(seats[0]!, false);
      expect(session.state?.players[0]?.eliminated).toBe(false);
    });

    it('refuses a no-op', async () => {
      expect(await setElimination({ session })(seats[0]!, false)).toEqual({
        ok: false,
        error: 'no-change'
      });
    });

    it('refuses an unknown player', async () => {
      expect(await setElimination({ session })(playerId('ghost'), true)).toEqual({
        ok: false,
        error: 'unknown-player'
      });
    });

    it('refuses when no game has started', async () => {
      const empty = createGameSession({
        clock: fakeClock(),
        log: createMemoryEventLog(),
        authorId: HOST
      });
      expect(await setElimination({ session: empty })(seats[0]!, true)).toEqual({
        ok: false,
        error: 'no-game'
      });
    });
  });

  describe('chooseFirstPlayer', () => {
    it('picks a player and records the decision', async () => {
      const result = await chooseFirstPlayer({ session, rng: fixedRng(0) })();
      expect(result).toEqual({ ok: true, value: seats[0] });
      expect(session.state?.firstPlayer).toBe(seats[0]);
    });

    it('can pick any seat, not just the first', async () => {
      await chooseFirstPlayer({ session, rng: fixedRng(0.99) })();
      expect(session.state?.firstPlayer).toBe(seats[1]);
    });

    it('never falls off the end when the roll is exactly one', async () => {
      await chooseFirstPlayer({ session, rng: fixedRng(1) })();
      expect(session.state?.firstPlayer).toBe(seats[1]);
    });

    it('can be rolled again', async () => {
      await chooseFirstPlayer({ session, rng: fixedRng(0) })();
      await chooseFirstPlayer({ session, rng: fixedRng(0.99) })();
      expect(session.state?.firstPlayer).toBe(seats[1]);
    });

    it('never chooses a player who is already out', async () => {
      await setElimination({ session })(seats[0]!, true);
      // A roll of zero would pick the first seat, but that seat is eliminated.
      await chooseFirstPlayer({ session, rng: fixedRng(0) })();
      expect(session.state?.firstPlayer).toBe(seats[1]);
    });

    it('refuses when everybody is out', async () => {
      await setElimination({ session })(seats[0]!, true);
      await setElimination({ session })(seats[1]!, true);
      expect(await chooseFirstPlayer({ session, rng: fixedRng(0) })()).toEqual({
        ok: false,
        error: 'no-players'
      });
    });

    it('refuses when no game has started', async () => {
      const empty = createGameSession({
        clock: fakeClock(),
        log: createMemoryEventLog(),
        authorId: HOST
      });
      expect(await chooseFirstPlayer({ session: empty, rng: fixedRng(0) })()).toEqual({
        ok: false,
        error: 'no-game'
      });
    });
  });

  describe('rematch', () => {
    it('resets life without asking for the setup again', async () => {
      await applyLifeDelta({ session })(seats[0]!, -25);
      await rematch({ session })();
      expect(session.state?.players.map((p) => p.life)).toEqual([40, 40]);
    });

    it('keeps the same people, names and colours', async () => {
      const before = session.state!.players.map((p) => ({ ...p }));
      await rematch({ session })();
      const after = session.state!.players;

      expect(after.map((p) => p.id)).toEqual(before.map((p) => p.id));
      expect(after.map((p) => p.name)).toEqual(before.map((p) => p.name));
      expect(after.map((p) => p.colour)).toEqual(before.map((p) => p.colour));
    });

    it('keeps the format', async () => {
      await rematch({ session })();
      expect(session.state?.config.format).toBe('commander');
      expect(session.state?.config.startingLife).toBe(40);
    });

    it('clears counters, eliminations and who went first', async () => {
      await changeCounter({ session })(seats[0]!, 'poison', 4);
      await setElimination({ session })(seats[1]!, true);
      await chooseFirstPlayer({ session, rng: fixedRng(0) })();

      await rematch({ session })();

      expect(session.state?.players[0]?.counters.poison).toBe(0);
      expect(session.state?.players[1]?.eliminated).toBe(false);
      expect(session.state?.firstPlayer).toBeNull();
    });

    it('appends rather than erasing — the finished game stays in the log', async () => {
      await applyLifeDelta({ session })(seats[0]!, -25);
      const before = session.events.length;
      await rematch({ session })();
      expect(session.events.length).toBe(before + 1);
    });

    it('refuses when no game has started', async () => {
      const empty = createGameSession({
        clock: fakeClock(),
        log: createMemoryEventLog(),
        authorId: HOST
      });
      expect(await rematch({ session: empty })()).toEqual({ ok: false, error: 'no-game' });
    });
  });

  describe('recordCommanderDamage', () => {
    const damage = () => recordCommanderDamage({ session });

    it('records damage against the commander that dealt it', async () => {
      expect(await damage()(seats[0]!, seats[1]!, 7)).toEqual({ ok: true, value: undefined });
      expect(commanderDamageFrom(session.state!.players[0]!, seats[1]!)).toBe(7);
    });

    it('leaves life alone — the caller decides whether it was life loss too', async () => {
      await damage()(seats[0]!, seats[1]!, 7);
      expect(session.state?.players[0]?.life).toBe(40);
    });

    it('corrects downwards', async () => {
      await damage()(seats[0]!, seats[1]!, 7);
      await damage()(seats[0]!, seats[1]!, -3);
      expect(commanderDamageFrom(session.state!.players[0]!, seats[1]!)).toBe(4);
    });

    it('refuses to correct below zero when there is nothing recorded', async () => {
      expect(await damage()(seats[0]!, seats[1]!, -1)).toEqual({ ok: false, error: 'no-change' });
      expect(session.events.filter((e) => e.kind === 'commander/damaged')).toHaveLength(0);
    });

    it('refuses a delta of zero', async () => {
      expect(await damage()(seats[0]!, seats[1]!, 0)).toEqual({ ok: false, error: 'no-change' });
    });

    it('refuses a fractional delta', async () => {
      expect(await damage()(seats[0]!, seats[1]!, 1.5)).toEqual({
        ok: false,
        error: 'not-an-integer'
      });
    });

    it('refuses an unknown victim', async () => {
      expect(await damage()(playerId('ghost'), seats[1]!, 5)).toEqual({
        ok: false,
        error: 'unknown-player'
      });
    });

    it('refuses an unknown attacker', async () => {
      expect(await damage()(seats[0]!, playerId('ghost'), 5)).toEqual({
        ok: false,
        error: 'unknown-source'
      });
    });

    it('refuses when no game has started', async () => {
      const empty = createGameSession({
        clock: fakeClock(),
        log: createMemoryEventLog(),
        authorId: HOST
      });
      expect(await recordCommanderDamage({ session: empty })(seats[0]!, seats[1]!, 5)).toEqual({
        ok: false,
        error: 'no-game'
      });
    });

    it('is cleared by a rematch', async () => {
      await damage()(seats[0]!, seats[1]!, 13);
      await rematch({ session })();
      expect(session.state?.players[0]?.commanderDamage).toEqual({});
    });
  });

  describe('undoLast', () => {
    it('reverses the most recent change', async () => {
      await applyLifeDelta({ session })(seats[0]!, -13);
      await undoLast({ session })();
      expect(session.state?.players[0]?.life).toBe(40);
    });

    it('walks backwards through several changes', async () => {
      await applyLifeDelta({ session })(seats[0]!, -13);
      await applyLifeDelta({ session })(seats[0]!, -5);
      await undoLast({ session })();
      expect(session.state?.players[0]?.life).toBe(27);
      await undoLast({ session })();
      expect(session.state?.players[0]?.life).toBe(40);
    });

    it('never unseats the players by undoing the start of the game', async () => {
      expect(await undoLast({ session })()).toEqual({ ok: false, error: 'nothing-to-undo' });
    });

    it('does not undo an undo — redo is a new forward event', async () => {
      await applyLifeDelta({ session })(seats[0]!, -13);
      await undoLast({ session })();
      expect(await undoLast({ session })()).toEqual({ ok: false, error: 'nothing-to-undo' });
    });

    it('appends a retraction rather than deleting history', async () => {
      await applyLifeDelta({ session })(seats[0]!, -13);
      const before = session.events.length;
      await undoLast({ session })();
      expect(session.events.length).toBe(before + 1);
      expect(session.events.at(-1)?.kind).toBe('event/retracted');
    });
  });
});
