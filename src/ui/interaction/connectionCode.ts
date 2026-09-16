/**
 * Packs the tiny bit of out-of-band context a join needs — the SDP, and
 * which seat it is for — into one string a person can paste anywhere: a
 * text message, read aloud, typed by hand. Deliberately not compressed:
 * base64 alone is short enough to paste comfortably, and a compression step
 * is easy to add later without touching anything that calls this.
 */

/**
 * These are the no-server path's own payloads, not the signalling port's.
 * ADR 0004's path 1 has no server in it at all, so it has no table code, no
 * ticket and no seat list — a QR is one offer shown to one scanner, which is
 * inherent to holding a phone up to somebody. Sharing a type with the port
 * only made it look as though the two paths carried the same thing.
 */
export type ManualOffer = {
  readonly sdp: string;
  readonly invitePlayerId: string;
  readonly invitePlayerName: string;
};

export type ManualAnswer = { readonly sdp: string };

export function encodeCode(payload: ManualOffer | ManualAnswer): string {
  return btoa(JSON.stringify(payload));
}

export type DecodedCode =
  { readonly ok: true; readonly value: ManualOffer | ManualAnswer } | { readonly ok: false };

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
      return { ok: true, value: value as ManualOffer | ManualAnswer };
    }
    return { ok: false };
  } catch {
    return { ok: false };
  }
}

export const isOfferPayload = (value: ManualOffer | ManualAnswer): value is ManualOffer =>
  'invitePlayerId' in value;
