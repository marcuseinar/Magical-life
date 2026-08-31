import { expect, test } from '@playwright/test';

test('plays a full game when served from a subdirectory', async ({ page }) => {
  const problems: string[] = [];
  page.on('pageerror', (error) => problems.push(String(error)));
  page.on('response', (response) => {
    if (response.status() >= 400) problems.push(`${response.status()} ${response.url()}`);
  });

  await page.goto('./');
  await expect(page.getByRole('heading', { name: 'Magical Life' })).toBeVisible();

  await page.getByRole('button', { name: /commander/i }).click();
  await page.getByRole('button', { name: '4', exact: true }).click();
  await page.getByRole('button', { name: /begin at 40/i }).click();

  await expect(page.getByLabel('Player 1: 40 life')).toBeVisible();
  await page.getByRole('button', { name: 'Player 3, lose one life' }).click();
  await expect(page.getByLabel('Player 3: 39 life')).toBeVisible();

  // The total counts the change at once, but the reload is reading the log,
  // so wait for it to get there: the badge exists only while something is
  // still pending.
  await expect(page.getByRole('button', { name: /cancel pending change/i })).toHaveCount(0, {
    timeout: 6000
  });

  await page.reload();
  await expect(page.getByLabel('Player 3: 39 life')).toBeVisible();

  // A base-path mistake shows up as a 404 on an asset, not as a failed assertion.
  expect(problems, `errors or 404s: ${problems.join(' | ')}`).toEqual([]);
});

test('does not answer for a sibling path, so previews stay their own app', async ({ page }) => {
  await page.goto('./');
  await page.waitForFunction(async () => {
    await navigator.serviceWorker.ready;
    return navigator.serviceWorker.controller !== null;
  });

  /*
   * A worker's scope is a path prefix, so this app also covers /pr-3/. If it
   * answered navigations there with its own cached shell, every pull-request
   * preview would silently render production instead.
   */
  const response = await page.goto('./pr-3/');
  expect(response?.status()).toBe(404);
  await expect(page.getByRole('button', { name: /begin at/i })).toHaveCount(0);
});

test('caches its shell under the base path, not the root', async ({ page }) => {
  await page.goto('./');
  await page.waitForFunction(async () => {
    await navigator.serviceWorker.ready;
    return navigator.serviceWorker.controller !== null;
  });

  const cachedShell = await page.evaluate(async () => {
    for (const name of await caches.keys()) {
      const cache = await caches.open(name);
      const shell =
        (await cache.match('/Magical-life/')) ?? (await cache.match('/Magical-life/index.html'));
      if (shell) return true;
    }
    return false;
  });

  expect(cachedShell).toBe(true);
});
