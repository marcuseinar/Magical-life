import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { openMenu, poisonOut, startGame } from './support';

const summary = (page: Page) => page.getByRole('dialog', { name: /wins$|^no winner$/i });

test('ends the game when the last opponent goes out, and says how', async ({ page }) => {
  await startGame(page, /commander/i, 3);

  await poisonOut(page, 'Player 2');
  await expect(summary(page)).toHaveCount(0);

  await poisonOut(page, 'Player 3');
  const sheet = page.getByRole('dialog', { name: 'Player 1 wins' });
  await expect(sheet).toBeVisible();

  const placings = sheet.getByRole('list', { name: 'Placings' }).getByRole('listitem');
  await expect(placings).toHaveText([/^1st\s*Player 1/, /^2nd\s*Player 3/, /^3rd\s*Player 2/]);
  await expect(placings.nth(1)).toContainText('Poison');
  await expect(sheet.getByText('Under a minute')).toBeVisible();
});

test('starts the rematch straight from the summary', async ({ page }) => {
  await startGame(page, /commander/i, 2);
  await poisonOut(page, 'Player 2');

  await page.getByRole('button', { name: 'Rematch' }).click();

  await expect(summary(page)).toHaveCount(0);
  await expect(page.getByLabel('Player 2: 40 life')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Back in' })).toHaveCount(0);
});

test('reopens the game when the last one out comes back in', async ({ page }) => {
  await startGame(page, /commander/i, 2);
  await poisonOut(page, 'Player 2');

  await page.getByRole('button', { name: 'Back to the board' }).click();
  await page.getByRole('button', { name: 'Back in' }).click();
  await expect(summary(page)).toHaveCount(0);

  // A fresh ending is a fresh summary, even though the last one was dismissed.
  await page.getByRole('button', { name: 'Out', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Player 1 wins' })).toBeVisible();
});

test('keeps a dismissed summary one menu away', async ({ page }) => {
  await startGame(page, /commander/i, 2);
  await poisonOut(page, 'Player 2');
  await page.getByRole('button', { name: 'Back to the board' }).click();
  await expect(summary(page)).toHaveCount(0);

  await openMenu(page);
  await page.getByRole('button', { name: 'Game summary' }).click();

  await expect(page.getByRole('dialog', { name: 'Player 1 wins' })).toBeVisible();
});
