import { expect, test } from '@playwright/test';
import { startGame } from './support';

/*
 * The app locks to portrait for now, rather than a landscape grid nobody has
 * designed yet. A phone turned sideways gets asked to turn back; a tablet or
 * desktop window that is merely wide and short keeps its own grid, from
 * GameBoard's `width >= 60rem` breakpoint.
 */

test('asks a phone in landscape to turn back to portrait', async ({ page }) => {
  await startGame(page, /commander/i, 4);
  await page.setViewportSize({ width: 844, height: 390 });

  await expect(page.getByRole('alertdialog', { name: /portrait/i })).toBeVisible();
});

test('says nothing to a phone held the right way up', async ({ page }) => {
  await startGame(page, /commander/i, 4);

  await expect(page.getByRole('alertdialog')).toBeHidden();
  await expect(page.getByRole('group', { name: 'Life totals' })).toBeVisible();
});

test('leaves a wide landscape window alone', async ({ page }) => {
  await startGame(page, /commander/i, 6);
  await page.setViewportSize({ width: 1280, height: 720 });

  await expect(page.getByRole('alertdialog')).toBeHidden();
  await expect(page.getByRole('group', { name: 'Life totals' })).toBeVisible();
});

test('turning back to portrait dismisses the prompt on its own', async ({ page }) => {
  await startGame(page, /commander/i, 4);
  await page.setViewportSize({ width: 844, height: 390 });
  await expect(page.getByRole('alertdialog')).toBeVisible();

  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByRole('alertdialog')).toBeHidden();
});
