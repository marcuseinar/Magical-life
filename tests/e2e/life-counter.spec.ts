import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { COMMITTED, expectLife, readLife, scrub, settled, startGame, zone } from './support';

test('opens straight into a game with no login and no waiting', async ({ page }) => {
  await page.goto('/');

  await expect(page.getByRole('heading', { name: 'Magical Life' })).toBeVisible();
  await expect(page.getByRole('button', { name: /sign in|log in/i })).toHaveCount(0);
});

test('plays a constructed game down to zero', async ({ page }) => {
  await startGame(page, /constructed/i, 2);

  await expect(page.getByLabel('Player 1: 20 life')).toBeVisible();
  await expect(page.getByLabel('Player 2: 20 life')).toBeVisible();

  for (let tap = 0; tap < 3; tap++) await zone(page, 'Player 1', 'lose').click();

  // Batched into a single change rather than three.
  await expect(page.getByRole('button', { name: /cancel pending change of -3/i })).toBeVisible();
  await expect(page.getByLabel('Player 1: 17 life')).toBeVisible({ timeout: COMMITTED });
  await expect(page.getByLabel('Player 2: 20 life')).toBeVisible();
});

test('cancels a pending change from the badge', async ({ page }) => {
  await startGame(page, /constructed/i, 2);

  await zone(page, 'Player 1', 'lose').click();
  await page.getByRole('button', { name: /cancel pending change/i }).click();

  await page.waitForTimeout(COMMITTED);
  expect(await readLife(page, 'Player 1')).toBe(20);
});

test('takes a big swing from a drag rather than twenty taps', async ({ page }) => {
  await startGame(page, /commander/i, 2);

  // Player 2 has the near panel, so screen-down is down for them too.
  await scrub(page, 'Player 2', -150);

  // Exactly, not approximately: the rate is flat, so 150px is 12 points and
  // nothing about where in the drag they were changes that. The press that
  // began the gesture is the thirteenth.
  await expectLife(page, 'Player 2').toBe(27);
});

test('reads the drag from the seat, not the screen, for the far panel', async ({ page }) => {
  await startGame(page, /commander/i, 2);

  // Player 1 sits across the table and their panel is upside down, so the same
  // physical drag means the opposite thing.
  await scrub(page, 'Player 2', -150);
  await expectLife(page, 'Player 2').toBeLessThan(40);

  await scrub(page, 'Player 1', -150);
  await expectLife(page, 'Player 1').toBeGreaterThan(40);
});

test('undoes the last change', async ({ page }) => {
  await startGame(page, /constructed/i, 2);

  await zone(page, 'Player 1', 'lose').click();
  await expect(page.getByLabel('Player 1: 19 life')).toBeVisible({ timeout: COMMITTED });

  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(page.getByLabel('Player 1: 20 life')).toBeVisible();
});

test('loses nothing when the app is reloaded mid-game', async ({ page }) => {
  await startGame(page, /commander/i, 4);

  await zone(page, 'Player 3', 'lose').click();
  // On the total at once — but the reload is testing the log, so it has to
  // wait for the change to actually get there. A pending change does not
  // survive a reload: the write is asynchronous and the page is gone before
  // it lands, which is why the app also flushes when the tab is merely
  // hidden, the case that really happens on a phone.
  await expect(page.getByLabel('Player 3: 39 life')).toBeVisible();
  await settled(page);

  await page.reload();

  await expect(page.getByLabel('Player 3: 39 life')).toBeVisible();
  await expect(page.getByLabel('Player 1: 40 life')).toBeVisible();
});

test('tracks poison to lethal and lets a player declare themselves out', async ({ page }) => {
  await startGame(page, /commander/i, 2);

  await page.getByRole('button', { name: 'Counters for Player 1' }).click();
  const sheet = page.getByRole('dialog', { name: /counters for player 1/i });
  const addPoison = sheet.getByRole('button', { name: /add one poison counter/i });
  for (let counter = 0; counter < 10; counter++) await addPoison.click();

  await page.getByRole('button', { name: 'Close counters' }).click();
  await expect(page.getByText('Poison')).toBeVisible();

  await page.getByRole('button', { name: 'Out', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Back in' })).toBeVisible();
});

test('opens the counter sheet without disturbing the cards behind it', async ({ page }) => {
  // Six players is the tightest layout, and where the editor used to spill out
  // of its panel and shove the life total off the card.
  await startGame(page, /commander/i, 6);

  const totalsInsideTheirPanels = async () =>
    page.evaluate(() =>
      [...document.querySelectorAll('article')].every((panel) => {
        const total = panel.querySelector('p.total');
        if (!total) return false;
        const card = panel.getBoundingClientRect();
        const box = total.getBoundingClientRect();
        return (
          box.left >= card.left - 1 &&
          box.right <= card.right + 1 &&
          box.top >= card.top - 1 &&
          box.bottom <= card.bottom + 1
        );
      })
    );

  expect(await totalsInsideTheirPanels()).toBe(true);

  await page.getByRole('button', { name: 'Counters for Player 6' }).click();
  await expect(page.getByRole('dialog', { name: /counters for player 6/i })).toBeVisible();

  expect(await totalsInsideTheirPanels()).toBe(true);
  await expect(page.getByLabel('Player 1: 40 life')).toBeVisible();
});

test('never scrolls, however many players are on screen', async ({ page }) => {
  await startGame(page, /commander/i, 6);

  const scrollable = () =>
    page.evaluate(() => {
      const root = document.documentElement;
      return {
        vertical: root.scrollHeight > root.clientHeight,
        horizontal: root.scrollWidth > root.clientWidth
      };
    });

  expect(await scrollable()).toEqual({ vertical: false, horizontal: false });

  await page.getByRole('button', { name: 'Counters for Player 6' }).click();
  expect(await scrollable()).toEqual({ vertical: false, horizontal: false });
});

test('spins round the table before landing on who goes first', async ({ page }) => {
  await startGame(page, /commander/i, 4);
  await page.getByRole('button', { name: /choose who goes first/i }).click();

  // The winner is decided immediately but must not be revealed until the spin ends.
  await expect(page.getByText('1st', { exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: /choose who goes first/i })).toBeDisabled();

  // Sample who is lit while it runs: a spotlight that never moves is not a spin.
  const spotlit = new Set<string>();
  const until = Date.now() + 2400;
  while (Date.now() < until) {
    // Read the DOM directly: a locator would auto-wait once the spin ends and
    // nothing is lit, hanging until the test times out.
    const name = await page.evaluate(
      () => document.querySelector('article[data-spotlit="true"] h2')?.textContent ?? null
    );
    if (name) spotlit.add(name.trim());
    await page.waitForTimeout(50);
  }
  expect(spotlit.size, `spotlight visited ${[...spotlit].join(', ')}`).toBeGreaterThan(1);

  // And it settles on exactly one player.
  await expect(page.getByText('1st', { exact: true })).toHaveCount(1, { timeout: 6000 });
  await expect(page.getByText(/goes first/i)).toBeVisible();
  await expect(page.getByRole('button', { name: /choose who goes first/i })).toBeEnabled();
});

test('blinks the winner once the spotlight stops', async ({ page }) => {
  await startGame(page, /commander/i, 4);
  await page.getByRole('button', { name: /choose who goes first/i }).click();
  await expect(page.getByText('1st', { exact: true })).toHaveCount(1, { timeout: 8000 });

  // Blinking, and only the winner.
  const blinking = await page.evaluate(() => {
    const panels = [...document.querySelectorAll('article')] as HTMLElement[];
    const lit = panels.filter((panel) => panel.dataset.celebrating === 'true');
    return {
      count: lit.length,
      isTheWinner: lit[0]?.textContent?.includes('1st') ?? false
    };
  });
  expect(blinking).toEqual({ count: 1, isTheWinner: true });

  // And it stops, rather than nagging for the rest of the game.
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          [...document.querySelectorAll('article')].filter(
            (panel) => (panel as HTMLElement).dataset.celebrating === 'true'
          ).length
      )
    )
    .toBe(0);
  await expect(page.getByText('1st', { exact: true })).toHaveCount(1);
});

test('can be rolled again, and still marks only one player', async ({ page }) => {
  await startGame(page, /commander/i, 4);

  for (let roll = 0; roll < 2; roll++) {
    await page.getByRole('button', { name: /choose who goes first/i }).click();
    await expect(page.getByText('1st', { exact: true })).toHaveCount(1, { timeout: 6000 });
  }

  await expect(page.getByText('1st', { exact: true })).toHaveCount(1);
});

test('skips the spin entirely when motion is unwelcome', async ({ page }) => {
  /*
   * Measured against a normal roll rather than a fixed number of milliseconds.
   * An absolute bound is flaky by construction here: the same work costs 463ms
   * on local Chromium and 1402ms on WebKit under CI load, so a threshold
   * calibrated on one browser fails on the other for reasons that have nothing
   * to do with the animation. Comparing the two paths cancels that overhead out,
   * because both pay it.
   */
  const timeRoll = async () => {
    const badge = page.getByText('1st', { exact: true });
    await expect(badge).toHaveCount(0);
    const started = Date.now();
    await page.getByRole('button', { name: /choose who goes first/i }).click();
    await expect(badge).toHaveCount(1, { timeout: 15_000 });
    return Date.now() - started;
  };

  await startGame(page, /commander/i, 4);
  const animated = await timeRoll();

  // A rematch clears the marker, so the second measurement starts from zero.
  await page.getByRole('button', { name: 'Rematch' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Rematch' }).click();

  await page.emulateMedia({ reducedMotion: 'reduce' });
  const instant = await timeRoll();

  // The schedule has a reduced-motion path of its own; this covers the wiring
  // that reads the preference, which unit tests cannot reach.
  expect(
    animated - instant,
    `animated ${animated}ms vs reduced-motion ${instant}ms`
  ).toBeGreaterThan(1500);
});

test('keeps every action on one row on a phone', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 800 });
  await startGame(page, /commander/i, 4);
  await expect(page.getByRole('button', { name: 'Undo' })).toBeVisible();

  const rows = await page.evaluate(
    () =>
      new Set(
        [...document.querySelectorAll('nav[aria-label="Game"] button')].map((button) =>
          Math.round(button.getBoundingClientRect().top)
        )
      ).size
  );

  expect(rows).toBe(1);
});

test('rematches without walking back through setup', async ({ page }) => {
  await startGame(page, /commander/i, 4);

  await zone(page, 'Player 2', 'lose').click();
  await expect(page.getByLabel('Player 2: 39 life')).toBeVisible({ timeout: COMMITTED });

  await page.getByRole('button', { name: 'Rematch' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Rematch' }).click();

  // Straight back into a game, same four players, fresh totals.
  await expect(page.getByLabel('Player 2: 40 life')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Player 4' })).toBeVisible();
  // Never passed back through setup.
  await expect(page.getByRole('button', { name: /begin at/i })).toHaveCount(0);
});

test('starts a fresh game only after confirming', async ({ page }) => {
  await startGame(page, /constructed/i, 2);

  await page.getByRole('button', { name: 'New game' }).click();
  await page.getByRole('button', { name: /keep playing/i }).click();
  await expect(page.getByLabel('Player 1: 20 life')).toBeVisible();

  await page.getByRole('button', { name: 'New game' }).click();
  await page.getByRole('button', { name: /end game/i }).click();
  await expect(page.getByRole('heading', { name: 'Magical Life' })).toBeVisible();
});

/** Resolves once a service worker is not merely registered but controlling this page. */
const serviceWorkerControlling = (page: Page) =>
  page.waitForFunction(async () => {
    await navigator.serviceWorker.ready;
    return navigator.serviceWorker.controller !== null;
  });

test('caches the app shell, which is what makes it work offline', async ({ page }) => {
  await startGame(page, /commander/i, 2);

  const supported = await page.evaluate(() => 'serviceWorker' in navigator);
  test.skip(!supported, 'This browser build has no service worker.');

  await serviceWorkerControlling(page);

  /*
   * The shell being in the cache is the actual contract — a missing one is how
   * offline broke the first time, when a single 404 on a dotfile made an atomic
   * `cache.addAll` reject and the install fail silently.
   */
  const cachedShell = await page.evaluate(async () => {
    for (const name of await caches.keys()) {
      const cache = await caches.open(name);
      if ((await cache.match('/')) ?? (await cache.match('/index.html'))) return true;
    }
    return false;
  });

  expect(cachedShell).toBe(true);
});

test('works with no network at all', async ({ page, context, browserName }) => {
  /*
   * Chromium only. Playwright's WebKit build fails `page.reload()` under
   * offline emulation with "WebKit encountered an internal error" — thrown by
   * the driver before the page is involved, so it tests the harness rather than
   * the app. Safari offline is a manual pre-release check (docs/testing.md);
   * the shell-cache test above covers the app's side of it everywhere.
   */
  test.skip(browserName === 'webkit', 'Playwright WebKit cannot emulate offline reloads.');

  await startGame(page, /commander/i, 2);
  await serviceWorkerControlling(page);
  await context.setOffline(true);
  await page.reload();

  await expect(page.getByLabel('Player 1: 40 life')).toBeVisible();
  await zone(page, 'Player 1', 'lose').click();
  await expect(page.getByLabel('Player 1: 39 life')).toBeVisible({ timeout: COMMITTED });
});

test('fits a 320 pixel screen', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 568 });
  await startGame(page, /commander/i, 4);

  const overflows = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth
  );
  expect(overflows).toBe(false);
  await expect(page.getByLabel('Player 4: 40 life')).toBeVisible();
});
