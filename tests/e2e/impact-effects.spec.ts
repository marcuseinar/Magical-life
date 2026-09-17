import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { openMenu, startGame } from './support';

/*
 * The animation itself — a burst of glyphs, aria-hidden — is deliberately
 * untested here: rule 6 has E2E finding elements by role and name, and
 * decoration hidden from assistive technology has neither. What is testable
 * from a role is the toggle that turns it on and off, and that it is
 * remembered.
 */
const toggle = (page: Page) => page.getByRole('switch', { name: /damage.*life effects/i });

test('damage and life effects default on, and can be turned off', async ({ page }) => {
  await startGame(page, /constructed/i, 2);
  await openMenu(page);
  await page.getByRole('button', { name: 'Settings' }).click();

  await expect(toggle(page)).toHaveAttribute('aria-checked', 'true');

  await toggle(page).click();
  await expect(toggle(page)).toHaveAttribute('aria-checked', 'false');
});

test('remembers the setting after leaving and returning to settings', async ({ page }) => {
  await startGame(page, /constructed/i, 2);
  await openMenu(page);
  await page.getByRole('button', { name: 'Settings' }).click();
  await toggle(page).click();
  await expect(toggle(page)).toHaveAttribute('aria-checked', 'false');

  await page.getByRole('button', { name: /back to the game/i }).click();
  await openMenu(page);
  await page.getByRole('button', { name: 'Settings' }).click();

  await expect(toggle(page)).toHaveAttribute('aria-checked', 'false');
});
