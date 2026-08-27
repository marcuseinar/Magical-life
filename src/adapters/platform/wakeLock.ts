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

export function createBrowserWakeLock(): WakeLock {
  let sentinel: WakeLockSentinel | null = null;

  return {
    async request() {
      if (!('wakeLock' in navigator)) return;
      try {
        sentinel = await navigator.wakeLock.request('screen');
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
