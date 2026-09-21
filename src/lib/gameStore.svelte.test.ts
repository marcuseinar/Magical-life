import { presetConfig } from '$domain/rules';
import { describe, expect, it } from 'vitest';
import { createGameStore } from './gameStore.svelte';
import { createMemoryEventLog } from '$adapters/storage/memoryEventLog';
import type { Transport, TransportState } from '$application/ports/transport';

function fakeTransport(): Transport & { setState(next: TransportState): void } {
  let state: TransportState = 'connecting';
  const handlers = new Set<(state: TransportState) => void>();
  return {
    get state() {
      return state;
    },
    send() {},
    onReceive() {
      return () => {};
    },
    onStateChange(handler) {
      handlers.add(handler);
      return () => handlers.delete(handler);
    },
    close() {},
    setState(next) {
      state = next;
      for (const handler of handlers) handler(next);
    }
  };
}

describe('game store — link state', () => {
  it('has no link state before any connection is ever tracked', () => {
    const store = createGameStore({ log: createMemoryEventLog() });
    expect(store.linkState).toBeNull();
  });

  it('reports direct once a tracked transport connects', () => {
    const store = createGameStore({ log: createMemoryEventLog() });
    const transport = fakeTransport();

    store.trackConnection(transport);
    transport.setState('connected');

    expect(store.linkState).toBe('direct');
  });

  it('reports lost once a connection that was up drops', () => {
    const store = createGameStore({ log: createMemoryEventLog() });
    const transport = fakeTransport();

    store.trackConnection(transport);
    transport.setState('connected');
    transport.setState('closed');

    expect(store.linkState).toBe('lost');
  });

  it('does not report lost for a handshake that never connected in the first place', () => {
    const store = createGameStore({ log: createMemoryEventLog() });
    const transport = fakeTransport();

    store.trackConnection(transport);
    transport.setState('closed');

    // Nothing was ever up, so there is nothing to have lost — the invite
    // screen's own "expired"/"error" states already cover this case.
    expect(store.linkState).toBeNull();
  });

  it('is lost as soon as any tracked connection drops, even while others hold', () => {
    // The host case: several opponents, one seat's phone drops mid-game.
    // Everyone else staying connected does not make that any less true.
    const store = createGameStore({ log: createMemoryEventLog() });
    const steady = fakeTransport();
    const dropped = fakeTransport();

    store.trackConnection(steady);
    store.trackConnection(dropped);
    steady.setState('connected');
    dropped.setState('connected');
    dropped.setState('closed');

    expect(store.linkState).toBe('lost');
  });

  it('stays lost even after a later connection succeeds, for the rest of this game', () => {
    // Nothing here re-establishes a dropped seat today — a claimed seat has
    // nothing left to invite (TableSheet.svelte) — so a later successful
    // `trackConnection` call is a genuinely different connection, not this
    // one recovering. Staying lost is the honest signal: something already
    // went wrong once this game, whether or not it happens to look fine now.
    const store = createGameStore({ log: createMemoryEventLog() });
    const first = fakeTransport();

    store.trackConnection(first);
    first.setState('connected');
    first.setState('closed');
    expect(store.linkState).toBe('lost');

    const second = fakeTransport();
    store.trackConnection(second);
    second.setState('connected');

    expect(store.linkState).toBe('lost');
  });
});

describe('game store — the game lifecycle', () => {
  const store = () => createGameStore({ log: createMemoryEventLog() });

  const commander = (count: number) =>
    Array.from({ length: count }, (_, index) => ({
      name: `Player ${index + 1}`,
      colour: 'white' as const
    }));

  it('leaves the previous game in the log when a new one begins', async () => {
    const game = store();
    await game.hydrate();
    await game.begin(presetConfig('commander'), commander(2));
    await game.changeLife(game.state!.players[0]!.id, -10);
    const before = game.events.length;

    await game.begin(presetConfig('standard'), commander(2));

    expect(game.state?.config.startingLife).toBe(20);
    // The whole point: the old game is still there to be read back.
    expect(game.events.length).toBeGreaterThan(before);
    expect(game.events.filter((event) => event.kind === 'game/started')).toHaveLength(2);
  });

  /*
   * The one call that destroys history, and the only one. It exists because
   * an append-only log grows forever and a phone gets handed to other
   * people — not because starting a different game needs it.
   */
  it('clears the history only when asked to, explicitly', async () => {
    const game = store();
    await game.hydrate();
    await game.begin(presetConfig('commander'), commander(2));
    expect(game.events.length).toBeGreaterThan(0);

    await game.clearHistory();

    expect(game.events).toHaveLength(0);
    expect(game.state).toBeNull();
  });

  it('carries a seat through a reconfigure, claims and all', async () => {
    const game = store();
    await game.hydrate();
    await game.begin(presetConfig('commander'), commander(2));
    const seats = game.state!.players.map((player) => ({
      id: player.id,
      name: player.name,
      colour: player.colour
    }));
    await game.claimSeat(seats[1]!.id);

    // "We said 30, not 40" — same people, different game.
    await game.begin(presetConfig('twoHeadedGiant'), seats);

    expect(game.state?.players.map((player) => player.id)).toEqual(seats.map((seat) => seat.id));
    expect(game.state?.players[1]?.claimed).toBe(true);
    expect(game.state?.players[0]?.life).toBe(30);
  });

  it('seats a new player at a game already running, unclaimed', async () => {
    const game = store();
    await game.hydrate();
    await game.begin(presetConfig('commander'), commander(2));

    const result = await game.addSeat('Dan', 'red');

    expect(result.ok).toBe(true);
    expect(game.state?.players).toHaveLength(3);
    const dan = game.state?.players.at(-1);
    expect(dan).toMatchObject({ name: 'Dan', colour: 'red', claimed: false, life: 40 });
  });
});
