import type { GameEvent } from '$domain/events';
import type { Transport } from '$application/ports/transport';

/**
 * WebRTC as a `Transport`. Proven in `spikes/webrtc-handshake/` before this
 * existed — this is that spike's `peer.mjs`, typed and promoted once it had
 * real coverage (`tests/e2e/webrtc-transport.spec.ts`), the same path
 * `IndexedDbEventLog` took: adapters touching real browser APIs are proven
 * through e2e journeys in this codebase, not isolated unit tests, because
 * jsdom implements neither.
 *
 * This file only knows how to move bytes once two peers have exchanged an
 * offer and an answer by *some* means — a pasted code today, a QR or a
 * short code through a signalling server later. Non-trickle ICE throughout:
 * `offer`/`answer` do not resolve until gathering finishes, so each is one
 * self-contained blob short enough to read aloud or paste into a text
 * message, not a stream of late-arriving candidates with nowhere to go once
 * the code has already been sent.
 */

/** Only the data channel matters; media codecs in a default RTCConfiguration
 *  bloat the SDP for no reason here. */
const RTC_CONFIG: RTCConfiguration = {
  iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
};

/**
 * A network that blocks STUN must not hang the handshake forever — the spike
 * found exactly this. Whatever candidates exist at the deadline are what get
 * sent; on a shared local network that is typically enough on its own, since
 * host candidates are gathered before any STUN round trip.
 */
const ICE_GATHERING_TIMEOUT_MS = 1500;

function waitForIceGatheringComplete(connection: RTCPeerConnection): Promise<void> {
  if (connection.iceGatheringState === 'complete') return Promise.resolve();
  return new Promise((resolve) => {
    const finish = () => {
      connection.removeEventListener('icegatheringstatechange', check);
      clearTimeout(timer);
      resolve();
    };
    const check = () => {
      if (connection.iceGatheringState === 'complete') finish();
    };
    connection.addEventListener('icegatheringstatechange', check);
    const timer = setTimeout(finish, ICE_GATHERING_TIMEOUT_MS);
  });
}

function transportFromChannel(connection: RTCPeerConnection, channel: RTCDataChannel): Transport {
  let state: Transport['state'] = 'connecting';
  const handlers = new Set<(events: readonly GameEvent[]) => void>();
  const stateHandlers = new Set<(state: Transport['state']) => void>();

  const setState = (next: Transport['state']) => {
    state = next;
    for (const handler of stateHandlers) handler(next);
  };

  channel.addEventListener('open', () => setState('connected'));
  const onClose = () => setState('closed');
  channel.addEventListener('close', onClose);
  channel.addEventListener('error', onClose);

  channel.addEventListener('message', (event: MessageEvent<string>) => {
    // Malformed or foreign traffic on this channel is not this layer's
    // problem to diagnose; drop it rather than let one bad message take the
    // whole connection down mid-game.
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
      if (channel.readyState !== 'open') return;
      channel.send(JSON.stringify(events));
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
      channel.close();
      connection.close();
      setState('closed');
    }
  };
}

export type WebRtcOfferer = {
  /** Resolves once ICE gathering finishes (or times out) — a complete blob,
   *  ready to hand to whatever will carry it to the other player. */
  offer: Promise<string>;
  /** Feed it the peer's answer once you have it, however it arrived. */
  accept(answer: string): Promise<void>;
  transport: Transport;
};

/** The player who taps "invite". */
export function offerConnection(): WebRtcOfferer {
  const connection = new RTCPeerConnection(RTC_CONFIG);
  const channel = connection.createDataChannel('game-events', { ordered: true });
  const transport = transportFromChannel(connection, channel);

  const offer = (async () => {
    const description = await connection.createOffer();
    await connection.setLocalDescription(description);
    await waitForIceGatheringComplete(connection);
    // Re-read rather than trust `description`: the local description now
    // carries the gathered candidates that `createOffer` could not have.
    return connection.localDescription!.sdp;
  })();

  return {
    offer,
    async accept(answer) {
      await connection.setRemoteDescription({ type: 'answer', sdp: answer });
    },
    transport
  };
}

export type WebRtcAnswerer = {
  /** Resolves once ICE gathering finishes. Send this back the way the offer
   *  arrived. */
  answer: Promise<string>;
  /**
   * Resolves once the offerer's channel has actually arrived. Unlike the
   * offerer, who creates the channel and so has a `Transport` from the first
   * line, the answerer only *receives* one — there is nothing to return
   * synchronously without faking a connected state that is not real yet.
   */
  transport: Promise<Transport>;
};

/** The player who pastes someone else's code. */
export function answerConnection(offer: string): WebRtcAnswerer {
  const connection = new RTCPeerConnection(RTC_CONFIG);

  // The offerer created the channel; this side receives it rather than
  // creating its own, or the two would talk past each other on separate
  // channels that never meet.
  const transport = new Promise<Transport>((resolve) => {
    connection.addEventListener('datachannel', (event) => {
      resolve(transportFromChannel(connection, event.channel));
    });
  });

  const answer = (async () => {
    await connection.setRemoteDescription({ type: 'offer', sdp: offer });
    const description = await connection.createAnswer();
    await connection.setLocalDescription(description);
    await waitForIceGatheringComplete(connection);
    return connection.localDescription!.sdp;
  })();

  return { answer, transport };
}
