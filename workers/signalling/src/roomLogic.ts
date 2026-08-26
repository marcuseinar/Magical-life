/**
 * The pure half of a signalling room: what a room's state should be, given
 * what happened and when. No storage, no Durable Object, no `Date.now()`
 * called directly — `now` always arrives as an argument, the same discipline
 * the main app's `domain/` uses, and for the same reason: it is what makes
 * this exhaustively unit-testable without a Workers runtime.
 */

export type OfferPayload = {
  readonly sdp: string;
  readonly invitePlayerId: string;
  readonly invitePlayerName: string;
};

export type AnswerPayload = {
  readonly sdp: string;
};

export type RoomRecord = {
  readonly offer: OfferPayload;
  readonly answer: AnswerPayload | null;
  readonly createdAt: number;
};

/** Matches the room lifetime documented in docs/design/multiplayer.md's
 *  short-code signalling path. */
export const ROOM_TTL_MS = 10 * 60 * 1000;

/** A room is live until its TTL, then it should read as though it never
 *  existed — a stale offer nobody claimed is not a room worth joining. */
export function isLive(record: RoomRecord | undefined, now: number): record is RoomRecord {
  return record !== undefined && now - record.createdAt <= ROOM_TTL_MS;
}

export function withOffer(offer: OfferPayload, now: number): RoomRecord {
  return { offer, answer: null, createdAt: now };
}

export function withAnswer(record: RoomRecord, answer: AnswerPayload): RoomRecord {
  return { ...record, answer };
}
