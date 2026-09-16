import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { openMenu, openNewGame, startGame } from './support';

/* Dark is the only theme; a pretty theme that fails contrast cannot ship. */
test('the opening screen is clean', async ({ page }) => {
  await page.goto('/');
  /*
   * `/` sends a device with no game to `/setup` (ADR 0005), and `goto`
   * resolves before that client-side navigation lands. Every other assertion
   * here retries; `analyze()` does not, so without this it can scan the
   * frame in between and fail on a screen nobody ever sees. Waiting is not
   * loosening the check — it is scanning the screen the test names.
   */
  await page.getByRole('button', { name: /begin at/i }).waitFor();
  const { violations } = await new AxeBuilder({ page }).analyze();
  expect(violations).toEqual([]);
});

test('a four-player pod is clean', async ({ page }) => {
  await startGame(page, /commander/i, 4);
  const { violations } = await new AxeBuilder({ page }).analyze();
  expect(violations).toEqual([]);
});

test('life can be changed without ever touching the screen', async ({ page }) => {
  await startGame(page, /constructed/i, 2);

  await page.getByRole('button', { name: 'Player 1, lose one life' }).focus();
  await page.keyboard.press('Enter');
  await page.keyboard.press('Enter');

  await expect(page.getByLabel('Player 1: 18 life')).toBeVisible({ timeout: 5000 });
});

/* The three surfaces ADR 0005 added. Each one carries a dialog, a danger
   colour, or both, which is where contrast and naming usually go wrong. */
test('the menu is clean', async ({ page }) => {
  await startGame(page, /commander/i, 4);
  await openMenu(page);
  const { violations } = await new AxeBuilder({ page }).analyze();
  expect(violations).toEqual([]);
});

test('setup opened over a running game is clean', async ({ page }) => {
  await startGame(page, /commander/i, 4);
  await openNewGame(page);
  const { violations } = await new AxeBuilder({ page }).analyze();
  expect(violations).toEqual([]);
});

test('settings is clean, and so is the confirmation guarding it', async ({ page }) => {
  await startGame(page, /commander/i, 4);
  await openMenu(page);
  await page.getByRole('button', { name: 'Settings' }).click();
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);

  await page.getByRole('button', { name: 'Clear history' }).click();
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
});
