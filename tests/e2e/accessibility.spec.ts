import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { startGame } from './support';

/* A pretty theme that fails contrast cannot ship, so both are gated. */
for (const scheme of ['light', 'dark'] as const) {
  test(`the opening screen is clean in ${scheme}`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: scheme });
    await page.goto('/');
    const { violations } = await new AxeBuilder({ page }).analyze();
    expect(violations).toEqual([]);
  });

  test(`a four-player pod is clean in ${scheme}`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: scheme });
    await startGame(page, /commander/i, 4);
    const { violations } = await new AxeBuilder({ page }).analyze();
    expect(violations).toEqual([]);
  });
}

test('life can be changed without ever touching the screen', async ({ page }) => {
  await startGame(page, /constructed/i, 2);

  await page.getByRole('button', { name: 'Player 1, lose one life' }).focus();
  await page.keyboard.press('Enter');
  await page.keyboard.press('Enter');

  await expect(page.getByLabel('Player 1: 18 life')).toBeVisible({ timeout: 5000 });
});
