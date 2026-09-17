import { afterEach, describe, expect, it, vi } from 'vitest';
import { presetConfig } from '$domain/rules';
import { createGameStore } from './gameStore.svelte';
import { hostTable, joinTableAsSeat } from './tableConnection.svelte';
import { createMemoryEventLog } from '$adapters/storage/memoryEventLog';
import {
  fakeSignalling,
  stubFailingPeerConnection,
  stubGatheredPeerConnection,
  stubRelayWebSocket
} from '../../tests/fakes/table';

const startedGame = async () => {
  const store = createGameStore({ log: createMemoryEventLog() });
  await store.hydrate();
  await store.begin(presetConfig('commander'), [{ name: 'Anna', colour: 'green' }]);
  return store;
};

const twoPlayerGame = async () => {
  const store = createGameStore({ log: createMemoryEventLog() });
  await store.hydrate();
  await store.begin(presetConfig('commander'), [
    { name: 'Anna', colour: 'green' },
    { name: 'Björn', colour: 'blue' }
  ]);
  return store;
};

afterEach(() => vi.useRealTimers());

/*
 * The poll is the heartbeat: it is what tells the worker the host is still
 * here, and it is the only way an answer ever reaches the host. Since the
 * table now stays open for the whole game rather than only while its sheet
 * is on screen, the rate it runs at is the difference between a heartbeat
 * and a phone asking a server something every second and a half all evening.
 */
describe('hosting a table', () => {
  it('asks every gap while the sheet is open, and ten times less often when it is not', async () => {
    stubGatheredPeerConnection();
    vi.useFakeTimers();
    const signalling = fakeSignalling();
    let polls = 0;
    const counted = {
      ...signalling.signalling,
      poll: async (...args: Parameters<typeof signalling.signalling.poll>) => {
        polls++;
        return signalling.signalling.poll(...args);
      }
    };

    const host = hostTable(await startedGame(), counted);
    await vi.advanceTimersByTimeAsync(0);
    expect(host.code).toBe('CODE1');

    const unwatch = host.watch();
    await vi.advanceTimersByTimeAsync(1500);
    expect(polls, 'watched').toBe(1);
    await vi.advanceTimersByTimeAsync(1500);
    expect(polls, 'watched').toBe(2);

    unwatch();
    await vi.advanceTimersByTimeAsync(1500 * 9);
    expect(polls, 'nobody looking: still inside one gap').toBe(2);
    await vi.advanceTimersByTimeAsync(1500);
    expect(polls, 'nobody looking: one gap later').toBe(3);

    // And looking again does not leave the next answer sitting for a gap.
    host.watch();
    await vi.advanceTimersByTimeAsync(1500);
    expect(polls, 'watched again').toBe(4);

    host.stop();
  });
});

/*
 * The relay fallback (ADR 0004, path 3): when direct WebRTC fails outright —
 * modelled here by a connection that fails the moment either side learns
 * about the other, rather than by waiting out a real, unbounded ICE
 * failure — the short-code path opens a plain WebSocket instead, keyed by
 * the same ticket the failed offer/answer already used. The relay wire
 * itself (real pairing and forwarding through the Durable Object) has its
 * own tests in `workers/signalling/test/relay.test.ts`; this only proves
 * that this file opens one, with the right address, at the right moment.
 */
describe('falling back to the relay when the direct link fails outright', () => {
  it('a host opens a relay keyed by the ticket a claimed offer used', async () => {
    stubFailingPeerConnection();
    const sockets = stubRelayWebSocket();
    vi.useFakeTimers();

    const signalling = fakeSignalling();
    let polls = 0;
    const withAnswer = {
      ...signalling.signalling,
      poll: async () => {
        polls++;
        if (polls === 1) {
          return {
            found: true as const,
            answer: { ticket: 't1', sdp: 'v=0 fake-sdp', seatId: 'p2' }
          };
        }
        return { found: true as const, answer: null };
      }
    };

    const host = hostTable(await startedGame(), withAnswer);
    await vi.advanceTimersByTimeAsync(0);
    host.watch();
    await vi.advanceTimersByTimeAsync(1500);

    expect(sockets).toHaveLength(1);
    expect(sockets[0]!.url).toBe('wss://relay.example/tables/CODE1/relay?ticket=t1');

    host.stop();
  });

  it('a joiner opens a relay keyed by its own ticket, and seeds from whichever transport delivers', async () => {
    stubFailingPeerConnection();
    const sockets = stubRelayWebSocket();

    const hostGame = await twoPlayerGame();
    const seatId = hostGame.state!.players[1]!.id;

    const signalling = fakeSignalling();
    const withOffer = {
      ...signalling.signalling,
      claimOffer: async () => ({ sdp: 'v=0 fake-sdp', ticket: 't1' }),
      submitAnswer: async () => true
    };

    const join = joinTableAsSeat('CODE1', seatId, withOffer);

    await vi.waitFor(() => expect(sockets).toHaveLength(1));
    expect(sockets[0]!.url).toBe('wss://relay.example/tables/CODE1/relay?ticket=t1');

    sockets[0]!.open();
    sockets[0]!.receive(hostGame.events);

    await vi.waitFor(() => expect(join.connected).toBe(true));
    expect(join.store?.events.length).toBe(hostGame.events.length + 1); // +1 for the claim
  });
});
