import type { GameEvent } from '$domain/events';
import type { Transport } from '$application/ports/transport';

/**
 * The relay fallback (ADR 0004, path 3) as a `Transport`: a plain WebSocket
 * to the same Durable Object the short-code path already talks to, carrying
 * game events themselves instead of an SDP handshake. Only reachable once a
 * ticket exists — the same one a specific offer/answer already used — so
 * this only ever applies to the short-code path; the QR and manual paths
 * have no server to fall back to at all, by design.
 *
 * Structurally identical to `webRtcTransport.ts`'s `transportFromChannel`:
 * same three states, same JSON-array wire format, same "drop what doesn't
 * parse rather than take the connection down" rule for foreign traffic.
 */
export function createRelayTransport(url: string): Transport {
  const socket = new WebSocket(url);
  let state: Transport['state'] = 'connecting';
  const handlers = new Set<(events: readonly GameEvent[]) => void>();
  const stateHandlers = new Set<(state: Transport['state']) => void>();

  const setState = (next: Transport['state']) => {
    state = next;
    for (const handler of stateHandlers) handler(next);
  };

  socket.addEventListener('open', () => setState('connected'));
  const onClose = () => setState('closed');
  socket.addEventListener('close', onClose);
  socket.addEventListener('error', onClose);

  socket.addEventListener('message', (event: MessageEvent<string>) => {
    let events: unknown;
    try {
      events = JSON.parse(event.data);
    } catch {
      return;
    }
    if (!Array.isArray(events)) return;
    for (const handler of handlers) handler(events as GameEvent[]);
  });

  return {
    get state() {
      return state;
    },
    send(events) {
      if (socket.readyState !== WebSocket.OPEN) return;
      socket.send(JSON.stringify(events));
    },
    onReceive(handler) {
      handlers.add(handler);
      return () => handlers.delete(handler);
    },
    onStateChange(handler) {
      stateHandlers.add(handler);
      return () => stateHandlers.delete(handler);
    },
    close() {
      socket.close();
      setState('closed');
    }
  };
}
