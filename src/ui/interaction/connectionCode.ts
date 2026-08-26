/**
 * Packs the tiny bit of out-of-band context a join needs — the SDP, and
 * which seat it is for — into one string a person can paste anywhere: a
 * text message, read aloud, typed by hand. Deliberately not compressed:
 * base64 alone is short enough to paste comfortably, and a compression step
 * is easy to add later without touching anything that calls this.
 */

export type OfferPayload = {
  readonly sdp: string;
  readonly invitePlayerId: string;
  /** Shown on the joiner's screen before they commit to anything — "Join as
   *  Anna?" is what a person needs to see, not a raw id. */
  readonly invitePlayerName: string;
};
export type AnswerPayload = { readonly sdp: string };

export function encodeCode(payload: OfferPayload | AnswerPayload): string {
  return btoa(JSON.stringify(payload));
}

export type DecodedCode =
  { readonly ok: true; readonly value: OfferPayload | AnswerPayload } | { readonly ok: false };

/** Never throws: a mistyped or truncated paste is an everyday event here,
 *  not a bug, and the caller decides how to tell the player about it. */
export function decodeCode(code: string): DecodedCode {
  try {
    const value: unknown = JSON.parse(atob(code.trim()));
    if (
      typeof value === 'object' &&
      value !== null &&
      'sdp' in value &&
      typeof (value as { sdp: unknown }).sdp === 'string'
    ) {
      return { ok: true, value: value as OfferPayload | AnswerPayload };
    }
    return { ok: false };
  } catch {
    return { ok: false };
  }
}

export const isOfferPayload = (value: OfferPayload | AnswerPayload): value is OfferPayload =>
  'invitePlayerId' in value;
