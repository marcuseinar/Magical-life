import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRelayTransport } from './relayTransport';
import type { GameEvent } from '$domain/events';
import type { TransportState } from '$application/ports/transport';

/**
 * A fake `WebSocket`, not a real one: unlike `RTCPeerConnection` (no faithful
 * jsdom/node equivalent, so `webRtcTransport.ts` is proven through e2e
 * instead), `WebSocket` is a small, fully-specified interface — the same
 * reasoning that gives `createHttpSignallingClient` a mocked-`fetch` unit
 * test rather than an e2e one.
 */
class FakeWebSocket {
  static readonly OPEN = 1;
  static readonly CLOSED = 3;
  readyState = 0;
  sent: string[] = [];
  private readonly listeners = new Map<string, Set<(event: unknown) => void>>();

  constructor(public readonly url: string) {}

  addEventListener(type: string, handler: (event: unknown) => void): void {
    (this.listeners.get(type) ?? this.listeners.set(type, new Set()).get(type)!).add(handler);
  }

  send(data: string): void {
    this.sent.push(data);
  }

  close(): void {
    this.readyState = FakeWebSocket.CLOSED;
    this.dispatch('close', {});
  }

  dispatch(type: string, event: unknown): void {
    for (const handler of this.listeners.get(type) ?? []) handler(event);
  }

  open(): void {
    this.readyState = FakeWebSocket.OPEN;
    this.dispatch('open', {});
  }

  receive(events: readonly GameEvent[]): void {
    this.dispatch('message', { data: JSON.stringify(events) });
  }
}

let sockets: FakeWebSocket[];
const lastSocket = () => sockets.at(-1)!;

describe('createRelayTransport', () => {
  beforeEach(() => {
    sockets = [];
    vi.stubGlobal(
      'WebSocket',
      class extends FakeWebSocket {
        constructor(url: string) {
          super(url);
          sockets.push(this);
        }
      }
    );
  });

  afterEach(() => vi.unstubAllGlobals());

  it('starts connecting, and reaches connected once the socket opens', () => {
    const transport = createRelayTransport('wss://example/tables/CODE/relay?ticket=t1');
    expect(transport.state).toBe('connecting');

    lastSocket().open();
    expect(transport.state).toBe('connected');
  });

  it('sends events as a JSON array once open, and drops them before that', () => {
    const transport = createRelayTransport('wss://example/relay');
    const event = { id: 'e1' } as unknown as GameEvent;

    transport.send([event]);
    expect(lastSocket().sent).toHaveLength(0);

    lastSocket().open();
    transport.send([event]);
    expect(lastSocket().sent).toEqual([JSON.stringify([event])]);
  });

  it('hands received events to every listener, and ignores foreign traffic', () => {
    const transport = createRelayTransport('wss://example/relay');
    lastSocket().open();
    const received: (readonly GameEvent[])[] = [];
    transport.onReceive((events) => received.push(events));

    lastSocket().receive([{ id: 'e1' } as unknown as GameEvent]);
    lastSocket().dispatch('message', { data: 'not json' });
    lastSocket().dispatch('message', { data: JSON.stringify({ not: 'an array' }) });

    expect(received).toEqual([[{ id: 'e1' }]]);
  });

  it('moves to closed when the socket closes, and stays closed once told to', () => {
    const transport = createRelayTransport('wss://example/relay');
    lastSocket().open();
    const states: TransportState[] = [];
    transport.onStateChange((state) => states.push(state));

    lastSocket().close();
    expect(transport.state).toBe('closed');
    expect(states).toEqual(['closed']);
  });

  it('closing from this side closes the socket and reports closed', () => {
    const transport = createRelayTransport('wss://example/relay');
    lastSocket().open();

    transport.close();
    expect(transport.state).toBe('closed');
    expect(lastSocket().readyState).toBe(FakeWebSocket.CLOSED);
  });
});
