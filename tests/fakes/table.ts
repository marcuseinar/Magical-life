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
