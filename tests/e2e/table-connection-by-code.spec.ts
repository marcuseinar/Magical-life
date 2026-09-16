import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { COMMITTED, openTable, startGame } from './support';

/*
 * The table-code path, against the real signalling worker
 * (workers/signalling/, run locally by Playwright's second webServer — see
 * playwright.config.ts). Independent browser contexts stand in for separate
 * phones.
 *
 * The property under test throughout is ADR 0006's: one code, one QR and one
 * link for the whole table, with the offer behind them rotating. The host
 * never invites anybody by name, and each joiner picks their own seat.
 */

/** The one code for the table, which appears as soon as the sheet opens —
 *  there is nobody to choose first any more. The box it appears in is there
 *  from the first frame, holding its size, so Copy link being enabled is
 *  what says a code has actually landed in it. */
async function tableCode(host: Page): Promise<string> {
  await openTable(host);
  await expect(host.getByRole('button', { name: 'Copy link' })).toBeEnabled({ timeout: 15_000 });
  return (await host.locator('.sheet p.short-code').textContent())?.trim() ?? '';
}

async function joinAs(joiner: Page, code: string, seat: string) {
  await joiner.goto(`/join?code=${code}`);
  await expect(joiner.getByText('Which seat are you?')).toBeVisible({ timeout: 15_000 });
  await joiner.getByRole('button', { name: seat, exact: true }).click();
}

test('a joined table converges to the same game, arriving by the table link', async ({
  browser
}) => {
  const hostContext = await browser.newContext();
  const joinContext = await browser.newContext();
  const host = await hostContext.newPage();
  const joiner = await joinContext.newPage();

  await startGame(host, /commander/i, 2);
  const code = await tableCode(host);

  await joinAs(joiner, code, 'Player 2');

  await expect(joiner.getByLabel('Player 1: 40 life')).toBeVisible({ timeout: 20_000 });
  await expect(joiner.getByLabel('Player 2: 40 life')).toBeVisible();

  await host.getByRole('button', { name: 'Done' }).click();
  await host.getByRole('button', { name: 'Player 1, lose one life' }).click();
  await expect(joiner.getByLabel('Player 1: 39 life')).toBeVisible({ timeout: COMMITTED + 5000 });

  await hostContext.close();
  await joinContext.close();
});

test('a joiner can type the table code by hand instead of following a link', async ({
  browser
}) => {
  const hostContext = await browser.newContext();
  const joinContext = await browser.newContext();
  const host = await hostContext.newPage();
  const joiner = await joinContext.newPage();

  await startGame(host, /commander/i, 2);
  const code = await tableCode(host);

  await joiner.goto('/join');
  await joiner.getByLabel('Short code').fill(code);
  await joiner.getByRole('button', { name: 'Continue' }).click();

  await expect(joiner.getByText('Which seat are you?')).toBeVisible({ timeout: 15_000 });
  await joiner.getByRole('button', { name: 'Player 2', exact: true }).click();

  await expect(joiner.getByLabel('Player 2: 40 life')).toBeVisible({ timeout: 20_000 });

  await hostContext.close();
  await joinContext.close();
});

/*
 * The whole reason any of this changed. Two people, one code — and the second
 * one is not handed a different code, does not scan a second QR, and is not
 * invited by the host. The offer behind the code rotates; the code does not.
 */
test('one code seats two people, one after the other', async ({ browser }) => {
  const hostContext = await browser.newContext();
  const firstContext = await browser.newContext();
  const secondContext = await browser.newContext();
  const host = await hostContext.newPage();
  const first = await firstContext.newPage();
  const second = await secondContext.newPage();

  await startGame(host, /commander/i, 3);
  const code = await tableCode(host);

  await joinAs(first, code, 'Player 2');
  await expect(first.getByLabel('Player 2: 40 life')).toBeVisible({ timeout: 20_000 });

  // The same code, untouched, for somebody who was not at the table when it
  // was shown. The host's seat list has moved on without the host doing
  // anything.
  await joinAs(second, code, 'Player 3');
  await expect(second.getByLabel('Player 3: 40 life')).toBeVisible({ timeout: 20_000 });

  // And the table knows about both of them.
  await expect(host.getByText('joined')).toHaveCount(2, { timeout: 15_000 });

  await hostContext.close();
  await firstContext.close();
  await secondContext.close();
});

test('shows a seat somebody already took as taken, not as a choice', async ({ browser }) => {
  const hostContext = await browser.newContext();
  const firstContext = await browser.newContext();
  const secondContext = await browser.newContext();
  const host = await hostContext.newPage();
  const first = await firstContext.newPage();
  const second = await secondContext.newPage();

  await startGame(host, /commander/i, 3);
  const code = await tableCode(host);

  await joinAs(first, code, 'Player 2');
  await expect(first.getByLabel('Player 2: 40 life')).toBeVisible({ timeout: 20_000 });

  await second.goto(`/join?code=${code}`);
  await expect(second.getByText('Which seat are you?')).toBeVisible({ timeout: 15_000 });
  await expect(second.getByRole('button', { name: /player 2.*taken/i })).toBeDisabled();

  await hostContext.close();
  await firstContext.close();
  await secondContext.close();
});

/*
 * The sheet is its finished size before it has anything to show in it. The
 * table takes a round trip to open, and the sheet used to spend that moment
 * as a single line of text — then grow a code, a QR and a button under the
 * player's thumb. Holding the round trip open is the only way to see that
 * moment on purpose; in real life it is over in about a second, which is
 * exactly why it was easy to ship.
 */
test('does not grow under the player when the code arrives', async ({ page }) => {
  let open = () => {};
  const held = new Promise<void>((resolve) => (open = resolve));
  await page.route('**/tables', async (route) => {
    await held;
    await route.continue();
  });

  await startGame(page, /commander/i, 4);
  await openTable(page);

  const sheet = page.getByRole('dialog', { name: 'Connect a table' });
  await expect(page.getByRole('button', { name: /preparing the link/i })).toBeDisabled();
  const opening = (await sheet.boundingBox())!;

  open();
  await expect(page.getByRole('button', { name: 'Copy link' })).toBeEnabled({ timeout: 15_000 });
  const opened = (await sheet.boundingBox())!;

  expect(Math.round(opened.height)).toBe(Math.round(opening.height));
  expect(Math.round(opened.y)).toBe(Math.round(opening.y));
});
