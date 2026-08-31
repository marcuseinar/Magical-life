import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { startGame } from './support';

/*
 * A life counter that lets the screen lock mid-game is failing at its one
 * job. Spies on navigator.wakeLock.request rather than the real thing —
 * there is no way to observe from outside the page whether a phone's screen
 * actually stayed lit, so this proves the app asks correctly: not before the
 * first tap, on the first tap, again on returning from the background, and
 * again if the browser revokes the lock on its own without the tab ever
 * going hidden — the failure mode reported from a real iPhone, which only
 * the sentinel's own `release` event can catch.
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

test('requests nothing until the first tap, then a screen wake lock on it', async ({ page }) => {
  await spyOnWakeLock(page);
  await page.goto('/');

  // Pegasus's web build (github.com/dannyrhubarb/pegasus) genuinely does not
  // lock a real iPhone's screen during hands-off replay playback, and it
  // never requests the lock without a tap behind it — every call is
  // downstream of a menu click. This app's own load-time, gesture-less
  // request kept coming back denied on the same phone; matching Pegasus
  // exactly, there should be no request at all before the first tap.
  expect(await wakeLockCalls(page)).toEqual([]);

  await page.getByRole('button', { name: /commander/i }).click();

  await expect.poll(() => wakeLockCalls(page)).toEqual(['screen']);
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

async function spyOnWakeLockDeniedOnFirstAttempt(page: Page) {
  await page.addInitScript(() => {
    let attempts = 0;
    const calls: string[] = [];
    (window as unknown as { __wakeLockCalls: string[] }).__wakeLockCalls = calls;

    Object.defineProperty(navigator, 'wakeLock', {
      configurable: true,
      value: {
        request: (type: string) => {
          attempts++;
          if (attempts === 1) return Promise.reject(new Error('NotAllowedError'));
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

test('retries on a later tap if an earlier one was denied', async ({ page }) => {
  await spyOnWakeLockDeniedOnFirstAttempt(page);

  // startGame's three taps (format, players, begin) give this multiple
  // chances — the first is denied, so the tap listener has to stay armed
  // rather than giving up after one failed attempt, for a later tap to
  // succeed.
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
});
