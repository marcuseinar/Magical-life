/**
 * Whether a path belongs to *this* deployment of the app.
 *
 * A service worker's scope is a path prefix, so the app at `/repo/` also
 * covers `/repo/pr-3/` — a pull-request preview, which is a different
 * deployment of the same app, with its own assets and its own worker. What
 * is ours is what we precached, plus anything under our own `_app/`.
 * Everything else is somebody else's to answer for, however much it looks
 * like ours, and passing it through is what keeps a preview a preview and
 * keeps its files out of the cache the real app reads from.
 */
export function belongsToApp(
  pathname: string,
  base: string,
  precached: readonly string[]
): boolean {
  return precached.includes(pathname) || pathname.startsWith(`${base}/_app/`);
}
