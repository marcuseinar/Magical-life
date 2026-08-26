import type { Transport } from '$application/ports/transport';
import type { PlayerId } from '$domain/ids';
import { playerId } from '$domain/ids';
import { answerConnection, offerConnection } from '$adapters/transport/webRtcTransport';
import { decodeCode, encodeCode, isOfferPayload } from '$ui/interaction/connectionCode';
import { createMemoryEventLog } from '$adapters/storage/memoryEventLog';
import { createGameStore } from './gameStore.svelte';
import type { GameStore } from './gameStore.svelte';

/**
 * Keeps one `GameStore` and one `Transport` in sync, in both directions, for
 * as long as the connection lasts. There is exactly one mechanism here, used
 * for the very first message and every one after it: whatever this device
 * has recorded or merged that the peer has not yet been sent, goes out.
 * Nothing distinguishes "catching a new joiner up" from "an ordinary life
 * change" — a joiner's first batch is simply everything, because nothing has
 * been sent yet.
 *
 * A merged-in event can echo back to whoever sent it once — this device
 * receives it, its own event count grows, and the effect below has no way to
 * know that particular growth came from the wire rather than a local
 * change. `GameSession.merge` dedupes by event id, so the echo is inert; it
 * costs one redundant message per event, not a loop, because the cursor
 * advances past it immediately and there is nothing left to re-send after
 * that.
 */
export function connectTransport(store: GameStore, transport: Transport): () => void {
  let sent = 0;

  const catchUp = () => {
    // Read `store.events` unconditionally, before the `transport.state`
    // guard: a Svelte effect only tracks the reactive values it actually
    // reads on a given run, and `transport.state` is a plain, untracked
    // property. Checking it first meant the earliest run — before the
    // connection was up — returned without ever reading `store.events`, so
    // the effect took no dependency on it and never re-ran for later life
    // changes. Reading it first, always, keeps the dependency regardless of
    // connection state.
    const events = store.events;
    if (transport.state !== 'connected') return;
    if (events.length > sent) {
      transport.send(events.slice(sent));
      sent = events.length;
    }
  };

  /*
   * `$effect` only runs inside a component's own setup — called here, from a
   * click handler or an async `.then()`, it would be "orphaned" and Svelte
   * refuses it. `$effect.root()` is Svelte's answer for exactly this: a
   * reactive scope created imperatively by library-shaped code rather than a
   * component, with its own teardown instead of an implicit one.
   *
   * The effect re-runs whenever `store.events` changes — a real, reactive
   * value — which covers every local record and every merge after the first.
   * It does *not* cover the connection itself opening, since `transport.state`
   * is a plain property with no framework behind it; `onStateChange` below is
   * what catches that one moment, the same catch-up logic either way.
   */
  const stopEffect = $effect.root(() => {
    $effect(catchUp);
  });

  const stopStateChange = transport.onStateChange(catchUp);

  const stopReceiving = transport.onReceive((events) => {
    void store.merge(events);
  });

  return () => {
    stopEffect();
    stopStateChange();
    stopReceiving();
  };
}

export type TableInvite = {
  /** The code to send the other player, once ICE gathering finishes. `null`
   *  until then — there is nothing shorter and still correct to show. */
  readonly code: string | null;
  readonly connected: boolean;
  /** Feed it the reply code once you have it, however it arrived. */
  accept(replyCode: string): Promise<void>;
};

/** The player who already has a game running, inviting `targetPlayerId`'s
 *  seat onto its own device. */
export function inviteToTable(store: GameStore, targetPlayerId: PlayerId): TableInvite {
  const offerer = offerConnection();
  let code = $state<string | null>(null);
  let connected = $state(false);

  // Read once, at invite time: the name a joiner is shown is the name as it
  // was when they were invited, not whatever it becomes if it changes later.
  const targetName =
    store.state?.players.find((player) => player.id === targetPlayerId)?.name ?? 'a player';

  void offerer.offer.then((sdp) => {
    code = encodeCode({ sdp, invitePlayerId: targetPlayerId, invitePlayerName: targetName });
  });

  offerer.transport.onStateChange((next) => {
    connected = next === 'connected';
  });

  connectTransport(store, offerer.transport);

  return {
    get code() {
      return code;
    },
    get connected() {
      return connected;
    },
    async accept(replyCode) {
      const decoded = decodeCode(replyCode);
      if (!decoded.ok || isOfferPayload(decoded.value)) {
        throw new Error('That is not a reply code.');
      }
      await offerer.accept(decoded.value.sdp);
    }
  };
}

export type TableJoin = {
  /** The reply to send back, once ICE gathering finishes. */
  readonly reply: string | null;
  readonly connected: boolean;
  /** Set once the host's first batch — its whole history — has arrived and
   *  been folded in. Not available before then: a store with nobody's
   *  events in it yet is not a game. */
  readonly store: GameStore | null;
};

/** The player pasting someone else's code. Throws if the code does not
 *  decode to an offer — a join screen is expected to have already used
 *  `whoIsThisFor` to check and shown the player something sensible before
 *  ever calling this. */
export function joinTable(offerCode: string): TableJoin {
  const decoded = decodeCode(offerCode);
  if (!decoded.ok || !isOfferPayload(decoded.value)) {
    throw new Error('That is not an invite code.');
  }
  const { sdp, invitePlayerId: invitePlayerIdRaw } = decoded.value;
  const invitePlayerId = playerId(invitePlayerIdRaw);

  const answerer = answerConnection(sdp);
  let reply = $state<string | null>(null);
  let connected = $state(false);
  let store = $state<GameStore | null>(null);

  void answerer.answer.then((sdp) => {
    reply = encodeCode({ sdp });
  });

  void answerer.transport.then((transport) => {
    /*
     * Deliberately not IndexedDB: `createIndexedDbEventLog` always opens the
     * one fixed database this device's own solo game already uses, so a
     * joined table's events would land in the same physical log — silently
     * merging two unrelated games. A per-table database is the real fix and
     * is not hard, but it buys back a reload surviving a connection that
     * cannot itself survive one yet: nothing here reconnects after a reload,
     * so rejoining is required regardless, and rejoining supplies a fresh
     * full copy of state through the same mechanism as the first join. In
     * memory, for now, is the honest choice until reconnection exists.
     */
    const newStore = createGameStore({ authorId: invitePlayerId, log: createMemoryEventLog() });
    let seeded = false;

    const stopSeeding = transport.onReceive((events) => {
      if (seeded) return;
      seeded = true;
      stopSeeding();
      void newStore.merge(events).then(() => {
        connectTransport(newStore, transport);
        store = newStore;
        connected = true;
      });
    });
  });

  return {
    get reply() {
      return reply;
    },
    get connected() {
      return connected;
    },
    get store() {
      return store;
    }
  };
}

export type Invitation = { readonly playerId: PlayerId; readonly playerName: string };

/** Reads an offer code enough to show "who is this for" before committing to
 *  answering it — a join screen's first honest response to a pasted code. */
export function whoIsThisFor(offerCode: string): Invitation | null {
  const decoded = decodeCode(offerCode);
  if (!decoded.ok || !isOfferPayload(decoded.value)) return null;
  return {
    playerId: playerId(decoded.value.invitePlayerId),
    playerName: decoded.value.invitePlayerName
  };
}
