import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { startGame } from './support';

/*
 * A life counter that lets the screen lock mid-game is failing at its one
 * job. Spies on navigator.wakeLock.request rather than the real thing —
 * there is no way to observe from outside the page whether a phone's screen
 * actually stayed lit, so this proves the app asks correctly, on load and
 * again on returning from the background, and leaves whether the OS grants
 * it to the platform.
 */

async function spyOnWakeLock(page: Page) {
  await page.addInitScript(() => {
    const release = () => Promise.resolve();
    const calls: string[] = [];
    (window as unknown as { __wakeLockCalls: string[] }).__wakeLockCalls = calls;
    Object.defineProperty(navigator, 'wakeLock', {
      configurable: true,
      value: {
        request: (type: string) => {
          calls.push(type);
          return Promise.resolve({ release, released: false, type });
        }
      }
    });
  });
}

const wakeLockCalls = (page: Page) =>
  page.evaluate(() => (window as unknown as { __wakeLockCalls: string[] }).__wakeLockCalls);

test('requests a screen wake lock on load', async ({ page }) => {
  await spyOnWakeLock(page);
  await startGame(page, /commander/i, 2);

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
