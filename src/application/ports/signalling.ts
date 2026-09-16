/**
 * Carries WebRTC offer/answer exchanges between devices that have no other
 * way to find each other — the short-code path in
 * `docs/design/multiplayer.md`. Never carries a game event; `Transport`
 * (the data channel it sets up) is what carries those, and it never touches
 * this port once an exchange completes.
 *
 * A room is one *table*, not one seat: the host opens it once and gets one
 * code, one QR and one link that everybody uses. The host publishes an
 * offer, exactly one joiner claims it, the host accepts their answer and
 * publishes a fresh one under the same code. See ADR 0006.
 */

/** Enough of a seat for a joiner to pick one before connecting. The host
 *  republishes this with every offer, so it is at most one joiner stale. */
export type SeatSummary = {
  readonly id: string;
  readonly name: string;
  readonly colour: string;
  readonly claimed: boolean;
};

export type TableSummary = {
  readonly seats: readonly SeatSummary[];
  /** Whether an offer is free to claim right now. `false` means somebody
   *  else is mid-handshake — a moment's wait, not a closed table. */
  readonly open: boolean;
};

/** The offer, and the ticket that identifies it. Only the holder of that
 *  ticket may answer; a joiner who took too long finds the host has moved on. */
export type ClaimedOffer = {
  readonly sdp: string;
  readonly ticket: string;
};

export type AnswerPayload = {
  readonly ticket: string;
  readonly sdp: string;
  /** Which seat the joiner picked. */
  readonly seatId: string;
};

export type Signalling = {
  /** The host opens a table and gets back the one short code for it. */
  openTable(seats: readonly SeatSummary[], sdp: string): Promise<{ code: string }>;
  /** What a joiner sees before committing to anything. `null` if the code is
   *  unknown or its host has gone. */
  lookUp(code: string): Promise<TableSummary | null>;
  /** Takes the offer off the table. `null` covers both "no such table" and
   *  "somebody else is joining right now" — a joiner waits either way. */
  claimOffer(code: string): Promise<ClaimedOffer | null>;
  /** The joiner posts their answer. `false` if the table is gone, or the
   *  host has already replaced the offer they answered. */
  submitAnswer(code: string, answer: AnswerPayload): Promise<boolean>;
  /**
   * The host's heartbeat: still here, here is the table as it now stands,
   * and has anybody answered?
   *
   * Asking is what holds a table open across a whole game. Reading clears the
   * answer, so one is acted on once. The seat list goes up with it because
   * the host publishes its next offer before the new arrival's claim has come
   * back over the data channel — without this, what a joiner is shown would
   * always be one person behind. `found: false` means the table itself is
   * gone, a different fact from nobody joining right now.
   */
  poll(
    code: string,
    seats: readonly SeatSummary[]
  ): Promise<{ found: true; answer: AnswerPayload | null } | { found: false }>;
  /** The host putting the next offer out under the same code, with a seat
   *  list showing whoever just sat down. */
  publishOffer(code: string, seats: readonly SeatSummary[], sdp: string): Promise<boolean>;
};
