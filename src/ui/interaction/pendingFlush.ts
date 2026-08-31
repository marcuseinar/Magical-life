/**
 * The list of pending life changes that have not reached the log yet.
 *
 * A panel's total counts its pending change straight away, so for up to a few
 * seconds the screen is ahead of the event log. That is fine while the only
 * thing reading the total is the person holding the phone — and wrong the
 * moment anything reads or resets the committed history instead: undo would
 * step past a change still on screen, a rematch would throw it away, and a
 * reload would lose it entirely.
 *
 * Panels register a way to force their change into the log; whatever is about
 * to touch history calls `flushPending()` first. A registry rather than a
 * prop threaded through the board because the callers are unrelated to the
 * panels — the toolbar, and the page going away — and neither owns them.
 */
const flushers = new Set<() => void>();

/** Returns the deregistration, for a panel to call as it is destroyed. */
export function registerPendingFlush(flush: () => void): () => void {
  flushers.add(flush);
  return () => {
    flushers.delete(flush);
  };
}

/** Commits every pending change at once. A no-op for panels holding nothing. */
export function flushPending(): void {
  // A copy, because committing can destroy the panel that registered it.
  for (const flush of [...flushers]) flush();
}
