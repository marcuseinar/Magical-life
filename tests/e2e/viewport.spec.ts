import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { openMenu, startGame } from './support';

/*
 * Every screen is laid out inside one `.app` grid, and a bare `display: grid`
 * gives it an implicit `auto` column — sized to the max-content of whatever
 * is showing. The board's max-content exceeds a phone, so the game filled the
 * width and looked correct; setup's did not, so it laid itself out at the
 * width of its own widest line (the title) and centred there, about 275px
 * inside a 390px phone. Two-column layouts inside then dropped to one column
 * and the screen grew tall enough to push its primary action off the bottom.
 *
 * It reached a real iPhone because nothing here looked at a screen other than
 * the game, and because the emulated phone it was developed on happened to be
 * wide enough for the title to keep the grid honest.
 */
const PHONES = [
  { name: 'a small phone', width: 375, height: 667 },
  { name: 'a common phone', width: 390, height: 844 }
];

/** How wide the screen laid itself out, against how wide the phone is. */
const sheetWidth = (page: Page) =>
  page.evaluate(() => {
    const main = document.querySelector('main');
    return {
      sheet: Math.round(main!.getBoundingClientRect().width),
      viewport: document.documentElement.clientWidth
    };
  });

for (const phone of PHONES) {
  test.describe(`${phone.name} (${phone.width}x${phone.height})`, () => {
    test.use({ viewport: { width: phone.width, height: phone.height } });

    test('sets a game up without the primary action falling off the bottom', async ({ page }) => {
      await page.goto('/');
      const begin = page.getByRole('button', { name: /begin at/i });
      await expect(begin).toBeVisible();

      expect(await sheetWidth(page)).toEqual({
        sheet: phone.width,
        viewport: phone.width
      });

      // In view without being scrolled to — the whole complaint.
      const reachable = await begin.evaluate(
        (node) => node.getBoundingClientRect().bottom <= window.innerHeight
      );
      expect(reachable, 'Begin is below the fold').toBe(true);

      // And the presets stay two to a row, which is what keeps it short.
      const rows = await page.evaluate(
        () =>
          new Set(
            [...document.querySelectorAll('.option')].map((option) =>
              Math.round(option.getBoundingClientRect().top)
            )
          ).size
      );
      expect(rows, 'presets should be two to a row').toBe(2);
    });

    test('lays every other screen out at the width of the phone', async ({ page }) => {
      await page.goto('/join');
      await expect(page.getByRole('button', { name: 'Scan a QR code' })).toBeVisible();
      expect(await sheetWidth(page)).toEqual({ sheet: phone.width, viewport: phone.width });

      await startGame(page, /commander/i, 4);
      await openMenu(page);
      await page.getByRole('button', { name: 'Settings' }).click();
      await expect(page.getByRole('button', { name: 'Clear history' })).toBeVisible();
      expect(await sheetWidth(page)).toEqual({ sheet: phone.width, viewport: phone.width });
    });
  });
}
