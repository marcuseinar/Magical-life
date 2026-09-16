import type { Transport } from '$application/ports/transport';
import type {
  ClaimedOffer,
  SeatSummary,
  Signalling,
  TableSummary
} from '$application/ports/signalling';
import type { PlayerId } from '$domain/ids';
import { playerId } from '$domain/ids';
import { answerConnection, offerConnection } from '$adapters/transport/webRtcTransport';
import { decodeCode, encodeCode, isOfferPayload } from '$ui/interaction/connectionCode';
import type { ManualOffer } from '$ui/interaction/connectionCode';
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
 *
 * Also feeds `store.linkState` (the connection-quality chip) — every caller
 * gets that for free rather than having to remember it at each of the four
 * call sites below.
 */
export function connectTransport(store: GameStore, transport: Transport): () => void {
  store.trackConnection(transport);
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
      void newStore.merge(events).then(async () => {
        // Claimed before the store is exposed, so nothing ever sees this
        // seat as unclaimed on the joiner's own screen — and the claim event
        // itself goes out over `connectTransport` like any other.
        await newStore.claimSeat(invitePlayerId);
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

function toInvitation(offer: ManualOffer): Invitation {
  return { playerId: playerId(offer.invitePlayerId), playerName: offer.invitePlayerName };
}

/** Reads an offer code enough to show "who is this for" before committing to
 *  answering it — a join screen's first honest response to a pasted code. */
export function whoIsThisFor(offerCode: string): Invitation | null {
  const decoded = decodeCode(offerCode);
  if (!decoded.ok || !isOfferPayload(decoded.value)) return null;
  return toInvitation(decoded.value);
}

/**
 * The short-code path: a `Signalling` adapter carries the offer/answer
 * exchange instead of a person copying a blob by hand.
 *
 * One code for the whole table, not one per person (ADR 0006). The host
 * publishes an offer, exactly one joiner claims it, the host accepts their
 * answer and immediately publishes a fresh offer under the same code. The
 * code, the QR and the link never change; what rotates behind them is the
 * offer. Everything past the exchange — the data channel, `connectTransport`,
 * the joiner's own in-memory store — is identical to the manual-code path
 * above, because the exchange is the only thing that differs.
 */

/** How often the host looks for somebody having answered. A person is
 *  reading a code aloud or scanning at the other end; there is no reason to
 *  poll faster than that. Asking is also what tells the worker the host is
 *  still here, which is what holds the table open across a whole game. */
const ANSWER_POLL_MS = 1500;

/** How long a joiner waits out somebody else's handshake before looking
 *  again. Only one offer is outstanding at a time, so arriving together
 *  means taking turns rather than failing. */
const CLAIM_RETRY_MS = 1200;

/** Long enough that a joiner who has walked away stops holding the table,
 *  short enough that nobody notices the wait. */
const CLAIM_ATTEMPTS = 12;

const summarise = (store: GameStore): readonly SeatSummary[] =>
  (store.state?.players ?? []).map((player) => ({
    id: player.id,
    name: player.name,
    colour: player.colour,
    claimed: player.claimed
  }));

export type TableHost = {
  /** The one code for this table, once the worker has issued it. `null`
   *  until then. */
  readonly code: string | null;
  /** How many people have connected through it so far. */
  readonly joined: number;
  /** The worker could not be reached at all — offline, not deployed, blocked
   *  network. The caller's signal to fall back to the manual code. */
  readonly error: boolean;
  /** Stops offering places. Call it when the sheet closes: the table then
   *  stops being touched and the worker lets it go. */
  stop(): void;
};

/**
 * Opens a table and keeps it open, connecting each joiner in turn.
 *
 * The loop is the whole design: offer, wait, accept, connect, offer again.
 * Because a fresh offer only goes out once the previous joiner is connected,
 * there is never more than one handshake in flight — which is also what
 * stops two joiners landing in the same seat, without any locking.
 */
export function hostTable(store: GameStore, signalling: Signalling): TableHost {
  let code = $state<string | null>(null);
  let joined = $state(0);
  let error = $state(false);
  let stopped = false;

  const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

  /** One place at the table: an offer, whoever takes it, and the connection
   *  that results. Resolves once that joiner is connected, or `false` if the
   *  table is gone. */
  async function offerAPlace(publish: (sdp: string) => Promise<boolean>): Promise<boolean> {
    const offerer = offerConnection();
    const sdp = await offerer.offer;
    if (stopped) return false;
    if (!(await publish(sdp))) return false;

    // Wired before anyone answers: the catch-up effect has to be watching
    // `store.events` from the start, or a change made while waiting never
    // reaches whoever eventually connects.
    connectTransport(store, offerer.transport);

    while (!stopped) {
      await pause(ANSWER_POLL_MS);
      if (stopped) return false;

      // The seat list rides along, so a joiner looking at the table sees who
      // has actually sat down rather than who had when the offer went out.
      const result = await signalling.poll(code!, summarise(store));
      if (!result.found) return false;
      if (result.answer === null) continue;

      await offerer.accept(result.answer.sdp);
      joined++;
      return true;
    }
    return false;
  }

  async function run() {
    try {
      const opened = await offerAPlace(async (sdp) => {
        const { code: issued } = await signalling.openTable(summarise(store), sdp);
        code = issued;
        return true;
      });
      if (!opened) return;

      // Same code, next place. The seat list goes out again each time, so a
      // joiner sees whoever just sat down.
      while (!stopped) {
        const more = await offerAPlace((sdp) =>
          signalling.publishOffer(code!, summarise(store), sdp)
        );
        if (!more) return;
      }
    } catch {
      error = true;
    }
  }

  void run();

  return {
    get code() {
      return code;
    },
    get joined() {
      return joined;
    },
    get error() {
      return error;
    },
    stop() {
      stopped = true;
    }
  };
}

/** A join screen's first honest response to a typed or scanned table code.
 *  `null` covers both "no such code" and "that table is gone"; the port does
 *  not distinguish them and neither does a joiner need it to. */
export async function lookUpTable(
  code: string,
  signalling: Signalling
): Promise<TableSummary | null> {
  return signalling.lookUp(code);
}

export type TableJoinByCode = {
  readonly connected: boolean;
  readonly store: GameStore | null;
  /** Nobody could be got hold of: the table went away, or every attempt to
   *  take a place ran into somebody else's handshake. */
  readonly failed: boolean;
};

/**
 * Takes a place at a table and sits in the seat the joiner picked.
 *
 * Claiming is a compare-and-swap at the worker, so arriving at the same
 * moment as somebody else means waiting a beat rather than colliding.
 */
export function joinTableAsSeat(
  code: string,
  seatId: PlayerId,
  signalling: Signalling
): TableJoinByCode {
  let connected = $state(false);
  let failed = $state(false);
  let store = $state<GameStore | null>(null);

  async function claim(): Promise<ClaimedOffer | null> {
    for (let attempt = 0; attempt < CLAIM_ATTEMPTS; attempt++) {
      const offer = await signalling.claimOffer(code);
      if (offer !== null) return offer;
      await new Promise((resolve) => setTimeout(resolve, CLAIM_RETRY_MS));
    }
    return null;
  }

  async function run() {
    const offer = await claim();
    if (offer === null) {
      failed = true;
      return;
    }

    const answerer = answerConnection(offer.sdp);
    const sdp = await answerer.answer;
    if (!(await signalling.submitAnswer(code, { ticket: offer.ticket, sdp, seatId }))) {
      failed = true;
      return;
    }

    const transport = await answerer.transport;
    // See joinTable's matching comment: deliberately in-memory, not the
    // shared IndexedDB log solo play uses.
    const newStore = createGameStore({ authorId: seatId, log: createMemoryEventLog() });
    let seeded = false;

    const stopSeeding = transport.onReceive((events) => {
      if (seeded) return;
      seeded = true;
      stopSeeding();
      void newStore.merge(events).then(async () => {
        // Claimed before the store is exposed, so nothing ever sees this
        // seat as unclaimed on the joiner's own screen — and the claim event
        // itself goes out over `connectTransport` like any other.
        await newStore.claimSeat(seatId);
        connectTransport(newStore, transport);
        store = newStore;
        connected = true;
      });
    });
  }

  void run().catch(() => (failed = true));

  return {
    get connected() {
      return connected;
    },
    get store() {
      return store;
    },
    get failed() {
      return failed;
    }
  };
}
