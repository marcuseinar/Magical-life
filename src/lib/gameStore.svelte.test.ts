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
