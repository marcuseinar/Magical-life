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
