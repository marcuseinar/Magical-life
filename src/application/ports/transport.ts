import type { GameEvent } from '$domain/events';

/**
 * A live channel to one peer. What carries the bytes — WebRTC, a relay, a
 * loopback for tests — is an adapter's problem; a use case only ever sees
 * this. How the channel gets *established* (QR, a short code, a signalling
 * server) is deliberately not part of this port: connecting is a whole
 * negotiation with its own state, this is what you have once it is open.
 */
export type Transport = {
  readonly state: 'connecting' | 'connected' | 'closed';

  /** Hand events to the peer. Ordering and delivery are the adapter's job;
   *  the log is idempotent under replay either way (`GameSession.merge`). */
  send(events: readonly GameEvent[]): void;

  /** Called with whatever the peer has sent, as it arrives. Returns a
   *  function that stops listening. */
  onReceive(handler: (events: readonly GameEvent[]) => void): () => void;

  close(): void;
};
