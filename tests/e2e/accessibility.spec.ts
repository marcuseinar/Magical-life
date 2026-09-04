import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { startGame } from './support';

/* Dark is the only theme; a pretty theme that fails contrast cannot ship. */
test('the opening screen is clean', async ({ page }) => {
  await page.goto('/');
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
