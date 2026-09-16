/**
 * What a piece of text a joiner arrived with is actually pointing at.
 *
 * A joiner scanning a QR cannot tell which of the host's two paths is live,
 * and should not have to: the short-code path shows a QR of a *link*
 * (`…/join?code=XKCD`), and the no-server path shows a QR of the offer blob
 * itself (ADR 0004's path 1). Both end up in front of the same camera.
 *
 * This only classifies. Neither answer is validated here — a short code is
 * looked up, an offer is decoded, and each says for itself whether it was
 * real. Guessing wrong therefore costs a clear "that code wasn't found"
 * rather than a wrong screen.
 */

export type JoinTarget =
  | { readonly kind: 'short-code'; readonly code: string }
  | { readonly kind: 'offer'; readonly code: string };

/** Matches the worker's room codes, which are short and alphanumeric. The
 *  upper bound is what the join field already accepts. */
const SHORT_CODE = /^[A-Z0-9]{1,8}$/;

export function readJoinTarget(scanned: string): JoinTarget | null {
  const text = scanned.trim();
  if (text === '') return null;

  const fromLink = codeFromLink(text);
  if (fromLink !== null) return { kind: 'short-code', code: fromLink };

  const upper = text.toUpperCase();
  if (SHORT_CODE.test(upper)) return { kind: 'short-code', code: upper };

  return { kind: 'offer', code: text };
}

function codeFromLink(text: string): string | null {
  // `URL` throws on anything that is not one, which is most of what arrives
  // here — an offer blob is base64, not a URL.
  let url: URL;
  try {
    url = new URL(text);
  } catch {
    return null;
  }
  const code = url.searchParams.get('code')?.trim();
  return code === undefined || code === '' ? null : code.toUpperCase();
}
