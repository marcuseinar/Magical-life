import { createHttpSignallingClient } from '$adapters/signalling/httpSignallingClient';
import type { Signalling } from '$application/ports/signalling';

/** `wrangler dev`'s default port — see workers/signalling/README.md. A
 *  deployed app must set `VITE_SIGNALLING_URL` at build time; this default
 *  only ever fires in local dev. */
const DEV_SIGNALLING_URL = 'http://localhost:8787';

export function defaultSignalling(): Signalling {
  // An empty string, not just an absent one, means "unset" here — an unset
  // GitHub Actions variable interpolates to `''` rather than vanishing, so
  // `??` alone would silently point production at localhost.
  const configured = import.meta.env.VITE_SIGNALLING_URL as string | undefined;
  const url = configured !== undefined && configured.length > 0 ? configured : DEV_SIGNALLING_URL;
  return createHttpSignallingClient(url);
}
