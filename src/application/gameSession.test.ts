import { beforeEach, describe, expect, it } from 'vitest';
import { createGameSession } from './gameSession';
import type { GameSession } from './gameSession';
import { createMemoryEventLog } from '$adapters/storage/memoryEventLog';
import type { EventLog } from './ports/eventLog';
import { playerId } from '$domain/ids';
import { fakeClock } from '../../tests/support/fakes';
import { ANNA, BJORN, commanderConfig, seat } from '../../tests/support/events';

const HOST = playerId('host');

describe('game session', () => {
  let log: EventLog;
  let session: GameSession;

  const start = () =>
    session.record({
      kind: 'game/started',
      config: commanderConfig,
      players: [seat(ANNA, 'Anna'), seat(BJORN, 'Björn')]
    });

  beforeEach(() => {
    log = createMemoryEventLog();
    session = createGameSession({ clock: fakeClock(), log, authorId: HOST });
  });

  it('has no state before a game starts', () => {
    expect(session.state).toBeNull();
    expect(session.events).toEqual([]);
  });

  it('stamps each recorded event with author, sequence and lamport clock', async () => {
    await start();
    const event = await session.record({ kind: 'life/changed', target: ANNA, delta: -3 });

    expect(event.authorId).toBe(HOST);
    expect(event.seq).toBe(1);
    expect(event.lamport).toBe(1);
    expect(event.id).toBe('host:1');
    expect(event.at).toBe(1_700_000_000_000);
  });

  it('derives state as it records', async () => {
    await start();
    await session.record({ kind: 'life/changed', target: ANNA, delta: -13 });
    expect(session.state?.players[0]?.life).toBe(27);
  });

  it('persists every event it records', async () => {
    await start();
    await session.record({ kind: 'life/changed', target: ANNA, delta: -13 });
    expect((await log.load()).length).toBe(2);
  });

  it('restores an identical game from storage', async () => {
    await start();
    await session.record({ kind: 'life/changed', target: ANNA, delta: -13 });
    const before = session.state;

    const reopened = createGameSession({ clock: fakeClock(), log, authorId: HOST });
    await reopened.hydrate();

    expect(reopened.state).toEqual(before);
  });

  it('continues the sequence after a reload rather than colliding with itself', async () => {
    await start();
    await session.record({ kind: 'life/changed', target: ANNA, delta: -1 });

    const reopened = createGameSession({ clock: fakeClock(), log, authorId: HOST });
    await reopened.hydrate();
    const event = await reopened.record({ kind: 'life/changed', target: ANNA, delta: -1 });

    expect(event.id).toBe('host:2');
    expect(reopened.state?.players[0]?.life).toBe(38);
  });

  it('advances the lamport clock past events written by other authors', async () => {
    await start();
    await session.merge([
      {
        kind: 'life/changed',
        target: BJORN,
        delta: -5,
        id: 'bjorn:40' as never,
        authorId: BJORN,
        seq: 40,
        at: 1,
        lamport: 40
      }
    ]);

    const mine = await session.record({ kind: 'life/changed', target: ANNA, delta: -1 });
    expect(mine.lamport).toBe(41);
    // Sequence numbers are per author, so mine is unaffected by Björn's.
    expect(mine.seq).toBe(1);
  });

  it('persists merged events too, so a peer’s history survives a reload', async () => {
    await start();
    await session.merge([
      {
        kind: 'life/changed',
        target: BJORN,
        delta: -5,
        id: 'bjorn:1' as never,
        authorId: BJORN,
        seq: 1,
        at: 1,
        lamport: 1
      }
    ]);
    expect((await log.load()).map((e) => e.id)).toContain('bjorn:1');
  });

  it('keeps events in total order regardless of when they arrived', async () => {
    await start();
    await session.record({ kind: 'life/changed', target: ANNA, delta: -1 });
    await session.merge([
      {
        kind: 'life/changed',
        target: BJORN,
        delta: -5,
        id: 'bjorn:0' as never,
        authorId: BJORN,
        seq: 0,
        at: 1,
        lamport: 0
      }
    ]);
    expect(session.events.map((e) => e.lamport)).toEqual([0, 0, 1]);
  });

  it('clears both state and storage on reset', async () => {
    await start();
    await session.reset();
    expect(session.state).toBeNull();
    expect(await log.load()).toEqual([]);
  });
});
