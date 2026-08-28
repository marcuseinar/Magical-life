/**
 * Keeps the screen from locking while the app is open — a life counter gone
 * dark mid-game is the app failing at its one job. Absent or refused (older
 * Safari, low battery, a backgrounded tab) is not an error: the screen just
 * locks as it would without this feature at all.
 */
export type WakeLock = {
  request(): Promise<void>;
  release(): Promise<void>;
};

/**
 * `onReleased` fires when the lock goes away for a reason other than our own
 * `release()` call — the browser revoking it unprompted, which iOS Safari in
 * particular is known to do without the tab ever going hidden. That is the
 * one case `visibilitychange` cannot catch, so a caller wanting the lock
 * held for as long as possible needs this to know when to ask again.
 */
export function createBrowserWakeLock(onReleased?: () => void): WakeLock {
  let sentinel: WakeLockSentinel | null = null;

  return {
    async request() {
      if (!('wakeLock' in navigator)) return;
      try {
        const acquired = await navigator.wakeLock.request('screen');
        sentinel = acquired;
        acquired.addEventListener('release', () => {
          // Our own release() below clears `sentinel` before calling the
          // browser's release(), so by the time this fires for that case it
          // no longer matches `acquired` — only an unprompted release does.
          if (sentinel !== acquired) return;
          sentinel = null;
          onReleased?.();
        });
      } catch {
        // Refused rather than unsupported — same outcome either way.
        sentinel = null;
      }
    },
    async release() {
      const current = sentinel;
      sentinel = null;
      await current?.release();
    }
  };
}
