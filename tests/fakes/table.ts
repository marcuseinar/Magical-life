import { vi } from 'vitest';
import type { Signalling } from '$application/ports/signalling';

/**
 * A signalling worker that hands out codes in order and never has anybody
 * answering. Enough for the host's own loop — open a table, publish an
 * offer, poll, repeat — which is what everything about a table's lifetime
 * is made of.
 */
export function fakeSignalling() {
  let opened = 0;
  const signalling: Signalling = {
    async openTable() {
      opened++;
      return { code: `CODE${opened}` };
    },
    async lookUp() {
      return null;
    },
    async claimOffer() {
      return null;
    },
    async submitAnswer() {
      return false;
    },
    async poll() {
      return { found: true, answer: null };
    },
    async publishOffer() {
      return true;
    },
    relayUrl(code, ticket) {
      return `wss://relay.example/tables/${code}/relay?ticket=${ticket}`;
    }
  };
  return { signalling, tablesOpened: () => opened };
}

const channel = () => ({ addEventListener() {}, readyState: 'connecting', close() {} });

/**
 * jsdom has no WebRTC at all, and every path into a table builds a peer
 * connection. This one has already gathered its candidates, so the offer
 * resolves at once and a test reaches the code.
 */
export function stubGatheredPeerConnection() {
  class Gathered {
    iceGatheringState = 'complete';
    localDescription = { sdp: 'v=0 fake-offer' };
    createDataChannel = channel;
    async createOffer() {
      return { type: 'offer', sdp: 'v=0 fake-offer' };
    }
    async setLocalDescription() {}
    async setRemoteDescription() {}
    addEventListener() {}
    removeEventListener() {}
    close() {}
  }
  vi.stubGlobal('RTCPeerConnection', Gathered);
}

/** The same, still gathering — which is the state a test of "no code yet"
 *  needs to stay in for as long as it is looking. */
export function stubGatheringPeerConnection() {
  class Gathering {
    iceGatheringState = 'gathering';
    createDataChannel = channel;
    createOffer() {
      return new Promise<never>(() => {});
    }
    addEventListener() {}
    removeEventListener() {}
    close() {}
  }
  vi.stubGlobal('RTCPeerConnection', Gathering);
}

/**
 * A connection that gathers at once but never opens a data channel and
 * fails outright the moment a remote description is set — the shape of a
 * network that defeats direct WebRTC entirely (ADR 0004, path 3's trigger).
 * `setRemoteDescription` is where both the offerer (accepting a reply) and
 * the answerer (accepting the original offer) first learn about the other
 * side, so failing there stands in for ICE connectivity checking never
 * succeeding, without needing a real bounded wait for it in a test.
 */
export function stubFailingPeerConnection() {
  class Failing {
    iceGatheringState = 'complete';
    localDescription = { sdp: 'v=0 fake-sdp' };
    connectionState = 'new';
    private readonly listeners = new Map<string, Set<() => void>>();

    createDataChannel = channel;
    async createOffer() {
      return { type: 'offer', sdp: 'v=0 fake-sdp' };
    }
    async createAnswer() {
      return { type: 'answer', sdp: 'v=0 fake-sdp' };
    }
    async setLocalDescription() {}
    async setRemoteDescription() {
      this.connectionState = 'failed';
      for (const handler of this.listeners.get('connectionstatechange') ?? []) handler();
    }
    addEventListener(type: string, handler: () => void) {
      (this.listeners.get(type) ?? this.listeners.set(type, new Set()).get(type)!).add(handler);
    }
    removeEventListener() {}
    close() {}
  }
  vi.stubGlobal('RTCPeerConnection', Failing);
}

/** A fake `WebSocket`, standing in for the relay fallback's — proving here
 *  only that `tableConnection.svelte.ts` opens one with the right address
 *  once the direct connection fails; the adapter behind it has its own fake
 *  and its own tests in `relayTransport.test.ts`. */
export function stubRelayWebSocket(): FakeRelaySocket[] {
  const created: FakeRelaySocket[] = [];

  class Socket implements FakeRelaySocket {
    static readonly OPEN = 1;
    static readonly CLOSED = 3;
    readyState = 0;
    sent: string[] = [];
    private readonly listeners = new Map<string, Set<(event: unknown) => void>>();

    constructor(public readonly url: string) {
      created.push(this);
    }

    addEventListener(type: string, handler: (event: unknown) => void): void {
      (this.listeners.get(type) ?? this.listeners.set(type, new Set()).get(type)!).add(handler);
    }

    send(data: string): void {
      this.sent.push(data);
    }

    close(): void {
      this.readyState = Socket.CLOSED;
      this.dispatch('close', {});
    }

    dispatch(type: string, event: unknown): void {
      for (const handler of this.listeners.get(type) ?? []) handler(event);
    }

    open(): void {
      this.readyState = Socket.OPEN;
      this.dispatch('open', {});
    }

    receive(events: unknown): void {
      this.dispatch('message', { data: JSON.stringify(events) });
    }
  }

  vi.stubGlobal('WebSocket', Socket);
  return created;
}

export type FakeRelaySocket = {
  readonly url: string;
  readonly sent: string[];
  readyState: number;
  open(): void;
  receive(events: unknown): void;
  dispatch(type: string, event: unknown): void;
};
