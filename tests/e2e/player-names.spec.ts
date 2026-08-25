import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { startGame } from './support';

const rename = async (page: Page, from: string, to: string) => {
  await page.getByRole('button', { name: `Rename ${from}` }).click();
  const sheet = page.getByRole('form', { name: new RegExp(`rename ${from}`, 'i') });
  await sheet.getByRole('textbox').fill(to);
  await sheet.getByRole('button', { name: 'Save' }).click();
};

test('names a player, and the whole app calls them that', async ({ page }) => {
  await startGame(page, /commander/i, 4);
  await rename(page, 'Player 1', 'Marcus');

  await expect(page.getByRole('heading', { name: 'Marcus' })).toBeVisible();
  // The life total announces the new name too, not just the plate.
  await expect(page.getByLabel('Marcus: 40 life')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Marcus, lose one life' })).toBeVisible();
});

test('leaves everybody else alone', async ({ page }) => {
  await startGame(page, /commander/i, 4);
  await rename(page, 'Player 2', 'Anna');

  await expect(page.getByRole('heading', { name: 'Player 1' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Anna' })).toBeVisible();
});

test('survives a reload, like everything else in the log', async ({ page }) => {
  await startGame(page, /commander/i, 4);
  await rename(page, 'Player 1', 'Marcus');

  await page.reload();
  await expect(page.getByRole('heading', { name: 'Marcus' })).toBeVisible();
});

test('carries into a rematch, because it is the same people playing again', async ({ page }) => {
  await startGame(page, /commander/i, 4);
  await rename(page, 'Player 1', 'Marcus');

  await page.getByRole('button', { name: 'Rematch' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Rematch' }).click();

  await expect(page.getByRole('heading', { name: 'Marcus' })).toBeVisible();
  await expect(page.getByLabel('Marcus: 40 life')).toBeVisible();
});

test('changes nothing when cancelled', async ({ page }) => {
  await startGame(page, /commander/i, 4);

  await page.getByRole('button', { name: 'Rename Player 1' }).click();
  await page.getByRole('textbox').fill('Marcus');
  await page.getByRole('button', { name: 'Cancel' }).click();

  await expect(page.getByRole('heading', { name: 'Player 1' })).toBeVisible();
});

test('refuses to save a name that is not a name', async ({ page }) => {
  await startGame(page, /commander/i, 4);

  await page.getByRole('button', { name: 'Rename Player 1' }).click();
  await page.getByRole('textbox').fill('   ');

  await expect(page.getByRole('button', { name: 'Save' })).toBeDisabled();
});

test('clamps a name too long for a plate rather than refusing it', async ({ page }) => {
  await startGame(page, /commander/i, 4);
  await rename(page, 'Player 1', 'Bartholomew the Extremely Verbose');

  // Sixteen characters, and the panel is not pushed out of shape by it.
  await expect(page.getByRole('heading', { name: 'Bartholomew the ' })).toBeVisible();
  const overflows = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth
  );
  expect(overflows).toBe(false);
});

test('announces the roll by name', async ({ page }) => {
  await startGame(page, /commander/i, 2);
  await rename(page, 'Player 1', 'Marcus');
  await rename(page, 'Player 2', 'Anna');

  await page.getByRole('button', { name: /choose who goes first/i }).click();
  await expect(page.getByText(/^(Marcus|Anna) goes first$/)).toBeVisible({ timeout: 8000 });
});
