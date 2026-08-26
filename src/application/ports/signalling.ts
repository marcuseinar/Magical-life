/**
 * Carries a WebRTC offer/answer exchange between two devices that have no
 * other way to find each other — the short-code path in
 * `docs/design/multiplayer.md`. Never carries a game event; `Transport`
 * (the data channel it sets up) is what carries those, and it never touches
 * this port once the exchange completes.
 */

export type OfferPayload = {
  readonly sdp: string;
  readonly invitePlayerId: string;
  /** Shown on the joiner's screen before they commit to anything — "Join as
   *  Anna?" is what a person needs to see, not a raw id. */
  readonly invitePlayerName: string;
};

export type AnswerPayload = { readonly sdp: string };

export type Signalling = {
  /** The host offers a table, gets back a short code to hand to the joiner. */
  createRoom(offer: OfferPayload): Promise<{ code: string }>;
  /** The joiner reads the offer for a code. `null` if the code is unknown or
   *  its room has expired. */
  getOffer(code: string): Promise<OfferPayload | null>;
  /** The joiner posts their answer. `false` if the room is gone. */
  submitAnswer(code: string, answer: AnswerPayload): Promise<boolean>;
  /** The host polls this for the joiner's answer. `found: false` means the
   *  room itself is gone — a different fact than "nobody has answered yet",
   *  which is `found: true, answer: null`. */
  getAnswer(
    code: string
  ): Promise<{ found: true; answer: AnswerPayload | null } | { found: false }>;
};
