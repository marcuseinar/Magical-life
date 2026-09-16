/**
 * The pure half of a signalling room: what a room's state should be, given
 * what happened and when. No storage, no Durable Object, no `Date.now()`
 * called directly — `now` always arrives as an argument, the same discipline
 * the main app's `domain/` uses, and for the same reason: it is what makes
 * this exhaustively unit-testable without a Workers runtime.
 *
 * A room is one *table*, not one seat. The host publishes an offer; exactly
 * one joiner may claim it; the host accepts their answer, connects, and
 * publishes a fresh offer under the same code for whoever is next. That
 * rotation is what lets one code, one QR and one link serve a whole table
 * rather than one person — and because only one offer is ever outstanding,
 * only one handshake is ever in flight, which is what keeps two joiners from
 * taking the same seat.
 *
 * It still sees only opaque SDP and the seat names a host volunteers so a
 * joiner can pick one. Never a life total, never a game event.
 */

export type SeatSummary = {
  readonly id: string;
  readonly name: string;
  readonly colour: string;
  readonly claimed: boolean;
};

/** The offer currently on the table, and the ticket identifying it. Only the
 *  joiner holding that ticket may answer. */
export type OutstandingOffer = {
  readonly sdp: string;
  readonly ticket: string;
};

export type AnswerPayload = {
  readonly ticket: string;
  readonly sdp: string;
  /** Which seat the joiner picked. The host needs it to know who just
   *  arrived; the room only carries it. */
  readonly seatId: string;
};

export type TableRecord = {
  readonly seats: readonly SeatSummary[];
  /** `null` once claimed, until the host publishes the next one. */
  readonly offer: OutstandingOffer | null;
  /** The ticket handed out with the offer that is currently in flight. */
  readonly outstandingTicket: string | null;
  readonly answer: AnswerPayload | null;
  /** The last time the host was heard from. The window runs from here. */
  readonly touchedAt: number;
};

/**
 * How long a table survives its host going quiet.
 *
 * This is a lobby, not a handshake: it stays open across a whole game so
 * somebody can arrive late, so the window runs from the host's last sign of
 * life rather than from creation. A host who closes the sheet or shuts the
 * app stops touching it, and it goes.
 */
export const ROOM_TTL_MS = 10 * 60 * 1000;

export function isLive(record: TableRecord | undefined, now: number): record is TableRecord {
  return record !== undefined && now - record.touchedAt <= ROOM_TTL_MS;
}

export function withTable(
  seats: readonly SeatSummary[],
  sdp: string,
  ticket: string,
  now: number
): TableRecord {
  return {
    seats,
    offer: { sdp, ticket },
    outstandingTicket: null,
    answer: null,
    touchedAt: now
  };
}

/** The host, having connected whoever answered last, putting the next offer
 *  out under the same code — along with a seat list that now shows that seat
 *  taken. */
export function publishOffer(
  record: TableRecord,
  seats: readonly SeatSummary[],
  sdp: string,
  ticket: string,
  now: number
): TableRecord {
  return { seats, offer: { sdp, ticket }, outstandingTicket: null, answer: null, touchedAt: now };
}

/** Compare-and-swap: the offer leaves the room with its first claimant, so a
 *  second joiner arriving in the same instant gets nothing rather than a
 *  duplicate of somebody else's handshake. */
export function claimOffer(record: TableRecord): {
  readonly record: TableRecord;
  readonly claimed: OutstandingOffer | null;
} {
  if (record.offer === null) return { record, claimed: null };
  return {
    record: { ...record, offer: null, outstandingTicket: record.offer.ticket },
    claimed: record.offer
  };
}

/** `null` when the ticket is not the one outstanding — a joiner who took too
 *  long, whose offer the host has already replaced. Connecting them to a peer
 *  that has moved on would look like a hang. */
export function withAnswer(record: TableRecord, answer: AnswerPayload): TableRecord | null {
  if (record.outstandingTicket === null || record.outstandingTicket !== answer.ticket) return null;
  return { ...record, answer };
}

/**
 * The host's heartbeat. Reading an answer clears it, so the host acts on it
 * exactly once; asking at all counts as the host still being there, which is
 * what holds the window open while a table waits for its next player; and it
 * carries the seat list up, so what a joiner is shown tracks who has actually
 * sat down rather than who had when the offer went out.
 *
 * That last part is not cosmetic. The host publishes the next offer as soon
 * as it has accepted an answer — before the new arrival's `seat/claimed` has
 * come back over the data channel — so without this the list would always be
 * one joiner behind.
 */
export function takeAnswer(
  record: TableRecord,
  seats: readonly SeatSummary[],
  now: number
): { readonly record: TableRecord; readonly answer: AnswerPayload | null } {
  return { record: { ...record, seats, answer: null, touchedAt: now }, answer: record.answer };
}
