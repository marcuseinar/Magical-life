import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { startGame } from './support';

/*
 * A life counter that lets the screen lock mid-game is failing at its one
 * job. Spies on navigator.wakeLock.request rather than the real thing —
 * there is no way to observe from outside the page whether a phone's screen
 * actually stayed lit, so this proves the app asks correctly: on load,
 * again on returning from the background, and again if the browser revokes
 * the lock on its own without the tab ever going hidden — the failure mode
 * reported from a real iPhone, which only the sentinel's own `release`
 * event can catch.
 */

async function spyOnWakeLock(page: Page) {
  await page.addInitScript(() => {
    const calls: string[] = [];
    (window as unknown as { __wakeLockCalls: string[] }).__wakeLockCalls = calls;

    let currentListeners: (() => void)[] = [];
    (window as unknown as { __fireWakeLockRelease: () => void }).__fireWakeLockRelease = () => {
      for (const handler of currentListeners) handler();
    };

    Object.defineProperty(navigator, 'wakeLock', {
      configurable: true,
      value: {
        request: (type: string) => {
          calls.push(type);
          const listeners: (() => void)[] = [];
          currentListeners = listeners;
          return Promise.resolve({
            released: false,
            type,
            release: () => Promise.resolve(),
            addEventListener: (eventType: string, handler: () => void) => {
              if (eventType === 'release') listeners.push(handler);
            }
          });
        }
      }
    });
  });
}

const wakeLockCalls = (page: Page) =>
  page.evaluate(() => (window as unknown as { __wakeLockCalls: string[] }).__wakeLockCalls);

const fireWakeLockRelease = (page: Page) =>
  page.evaluate(() =>
    (window as unknown as { __fireWakeLockRelease: () => void }).__fireWakeLockRelease()
  );

/*
 * Both mechanisms below can report success back to this app's own code while
 * the screen still sleeps on a real device — that gap is exactly what sent
 * this suite chasing three separate Wake Lock fixes and a whole second
 * mechanism, only to have a real iPhone still lock. The status text next to
 * the version number is the one place that gap can be closed: it shows,
 * on the device itself, what the browser actually told the page — no remote
 * debugger required. `.version` rather than a role query because the element
 * is deliberately `aria-hidden` — decorative diagnostic text, not meant to
 * reach the accessibility tree at all.
 */
const statusText = (page: Page) => page.locator('.version').innerText();

test('requests a screen wake lock on load', async ({ page }) => {
  await spyOnWakeLock(page);
  await startGame(page, /commander/i, 2);

  await expect.poll(() => wakeLockCalls(page)).toEqual(['screen']);
  await expect.poll(() => statusText(page)).toContain('wl:granted');
});

test('requests it again on returning from the background', async ({ page }) => {
  await spyOnWakeLock(page);
  await startGame(page, /commander/i, 2);
  await expect.poll(() => wakeLockCalls(page)).toEqual(['screen']);

  // The browser itself releases the lock when a tab is hidden; simulating
  // that and coming back is what proves the re-request, not just the first one.
  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' });
    document.dispatchEvent(new Event('visibilitychange'));
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
    document.dispatchEvent(new Event('visibilitychange'));
  });

  await expect.poll(() => wakeLockCalls(page)).toEqual(['screen', 'screen']);
});

test('requests it again if the browser revokes it on its own, tab never hidden', async ({
  page
}) => {
  await spyOnWakeLock(page);
  await startGame(page, /commander/i, 2);
  await expect.poll(() => wakeLockCalls(page)).toEqual(['screen']);

  // No visibilitychange at all here — this is the case reported from a real
  // iPhone: the app stayed open and in view, and the screen still slept a
  // few minutes in because nothing noticed the lock was gone.
  await fireWakeLockRelease(page);

  await expect.poll(() => wakeLockCalls(page)).toEqual(['screen', 'screen']);
});

async function spyOnGestureGatedWakeLock(page: Page) {
  await page.addInitScript(() => {
    let hadGesture = false;
    // Capture phase, so this always observes the tap before the app's own
    // (bubble-phase) retry listener acts on the same event.
    document.addEventListener('pointerdown', () => (hadGesture = true), { capture: true });

    const calls: string[] = [];
    (window as unknown as { __wakeLockCalls: string[] }).__wakeLockCalls = calls;

    Object.defineProperty(navigator, 'wakeLock', {
      configurable: true,
      value: {
        request: (type: string) => {
          if (!hadGesture) return Promise.reject(new Error('NotAllowedError'));
          calls.push(type);
          return Promise.resolve({
            released: false,
            type,
            release: () => Promise.resolve(),
            addEventListener: () => {}
          });
        }
      }
    });
  });
}

test('recovers on the first tap if the initial request needed a user gesture', async ({ page }) => {
  await spyOnGestureGatedWakeLock(page);

  // startGame itself performs the first tap (choosing a format), which is
  // exactly what the recovery path is for — by the time it returns, the
  // lock should be held even though the page-load attempt was refused.
  await startGame(page, /commander/i, 2);

  await expect.poll(() => wakeLockCalls(page)).toEqual(['screen']);
});

test('does nothing, without erroring, when the browser refuses or lacks the API', async ({
  page
}) => {
  // Shadows the real navigator.wakeLock with an own property whose value is
  // undefined — `in` still finds the name (inherited or not, it doesn't
  // check the value), so this exercises the same path an older Safari or a
  // refused request takes: the call itself throws, and that has to be
  // caught rather than crash the app.
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'wakeLock', { configurable: true, value: undefined });
  });

  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));

  await startGame(page, /commander/i, 2);
  await expect(page.getByRole('button', { name: 'Undo' })).toBeVisible();

  expect(errors).toEqual([]);
  await expect.poll(() => statusText(page)).toContain('wl:denied');
});

/*
 * The Wake Lock API above can resolve successfully on iOS Safari without
 * actually stopping the screen from sleeping — a documented bug in
 * standalone/home-screen mode, not fixed until iOS 18.4. A muted, looping
 * video is a second, independent mechanism for the same effect, so this runs
 * against the real browser's canvas/video implementation rather than a mock:
 * there is no substitute for proving actual frames are being decoded.
 */

test('keeps a hidden, muted video playing as a second, independent keep-awake mechanism', async ({
  page
}) => {
  await startGame(page, /commander/i, 2);

  const videoState = () =>
    page.evaluate(() => {
      const video = document.querySelector('video');
      const track = (video?.srcObject as MediaStream | null)?.getVideoTracks()[0];
      return video === null
        ? null
        : {
            paused: video.paused,
            muted: video.muted,
            loop: video.loop,
            trackState: track?.readyState
          };
    });

  await expect.poll(videoState).toEqual({
    paused: false,
    muted: true,
    loop: true,
    trackState: 'live'
  });

  // Which signal actually moves for a live MediaStream source differs by
  // engine — headless Chromium ticks readyState up to HAVE_ENOUGH_DATA but
  // leaves currentTime frozen at 0, WebKit does the reverse — so either one
  // advancing is proof the video is genuinely decoding frames over time,
  // not just sitting in a `paused: false` state that never actually renders.
  await expect
    .poll(() =>
      page.evaluate(() => {
        const video = document.querySelector('video')!;
        return video.currentTime > 0 || video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA;
      })
    )
    .toBe(true);

  await expect.poll(() => statusText(page)).toContain('vid:playing');
});

test('the video fallback does nothing, without erroring, when captureStream is unsupported', async ({
  page
}) => {
  await page.addInitScript(() => {
    Object.defineProperty(HTMLCanvasElement.prototype, 'captureStream', {
      configurable: true,
      value: undefined
    });
  });

  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));

  await startGame(page, /commander/i, 2);
  await expect(page.getByRole('button', { name: 'Undo' })).toBeVisible();

  expect(await page.evaluate(() => document.querySelector('video'))).toBeNull();
  expect(errors).toEqual([]);
  await expect.poll(() => statusText(page)).toContain('vid:blocked');
});
