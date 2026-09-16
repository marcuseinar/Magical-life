import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { inviteBySeat, openMenu, openTable, startGame } from './support';

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

/**
 * Anything a person could be asked to scroll to, or that iOS would zoom into.
 *
 * Rule 10 says the app is a fixed surface. Screens used to opt back out of
 * that with their own `overflow-y`, which meant a screen that did not fit
 * quietly became a screen you had to scroll — and on a phone the part below
 * the fold was usually the button you came to press. The opt-ins are gone, so
 * anything that does not fit is now invisible rather than merely awkward,
 * which is exactly why this has to be checked everywhere rather than trusted.
 *
 * The zoom half is the same trap from the other side: iOS Safari zooms the
 * page in whenever a focusable field under 16px takes focus, and this app
 * blocks pinch — so that zoom cannot be undone. A readonly blob is a
 * paragraph now; the fields you actually type into are 1rem.
 */
const unreachable = (page: Page) =>
  page.evaluate(() => {
    const problems: string[] = [];

    for (const element of document.querySelectorAll<HTMLElement>('*')) {
      // `.sr-only` is one pixel tall on purpose and always reads as overflowing.
      if (element.classList.contains('sr-only')) continue;
      const style = getComputedStyle(element);
      const scrolls =
        style.overflowY === 'auto' ||
        style.overflowY === 'scroll' ||
        element === document.documentElement ||
        element === document.body;
      if (scrolls && element.clientHeight > 0 && element.scrollHeight - element.clientHeight > 1) {
        problems.push(
          `${element.tagName.toLowerCase()} scrolls by ${element.scrollHeight - element.clientHeight}px`
        );
      }
    }

    for (const control of document.querySelectorAll<HTMLElement>('button, a, input, textarea')) {
      const box = control.getBoundingClientRect();
      if (box.height === 0) continue;
      if (box.bottom > window.innerHeight + 1 || box.top < -1) {
        problems.push(`off screen: "${(control.textContent ?? '').trim().slice(0, 30)}"`);
      }
      const size = parseFloat(getComputedStyle(control).fontSize);
      const typeable =
        control instanceof HTMLInputElement || control instanceof HTMLTextAreaElement;
      if (typeable && !(control as HTMLInputElement).disabled && size < 16) {
        problems.push(`iOS would zoom into a ${size}px field`);
      }
    }

    return [...new Set(problems)];
  });

for (const phone of [...PHONES, { name: 'a very small phone', width: 320, height: 568 }]) {
  test.describe(`nothing scrolls on ${phone.name}`, () => {
    test.use({ viewport: { width: phone.width, height: phone.height } });

    test('across setup, the game, the menu and settings', async ({ page }) => {
      await page.goto('/');
      await expect(page.getByRole('button', { name: /begin at/i })).toBeVisible();
      expect(await unreachable(page), 'setup').toEqual([]);

      await startGame(page, /commander/i, 6);
      expect(await unreachable(page), 'a six player game').toEqual([]);

      await openMenu(page);
      expect(await unreachable(page), 'the menu').toEqual([]);

      await page.getByRole('button', { name: 'New game' }).click();
      await expect(page.getByRole('button', { name: 'Back to the game' })).toBeVisible();
      expect(await unreachable(page), 'setup over a running game').toEqual([]);
      await page.getByRole('button', { name: 'Back to the game' }).click();

      await openMenu(page);
      await page.getByRole('button', { name: 'Settings' }).click();
      await expect(page.getByRole('button', { name: 'Clear history' })).toBeVisible();
      expect(await unreachable(page), 'settings').toEqual([]);

      await page.getByRole('button', { name: 'Clear history' }).click();
      expect(await unreachable(page), 'the clear-history confirmation').toEqual([]);
    });

    test('across the table sheet and joining', async ({ page }) => {
      await startGame(page, /commander/i, 6);

      // The no-server path: the densest thing in the app, and the one that
      // used to need a scroll before anyone could reach Connect.
      await openTable(page);
      await inviteBySeat(page, 'Player 2');
      await expect(page.locator('.sheet p.code')).not.toHaveText('', { timeout: 15_000 });
      expect(await unreachable(page), 'a hand-carried invite').toEqual([]);

      await page.goto('/join');
      await expect(page.getByRole('button', { name: 'Scan a QR code' })).toBeVisible();
      expect(await unreachable(page), 'joining').toEqual([]);

      await page.getByRole('button', { name: 'Paste a code instead' }).click();
      await expect(page.getByLabel('Their code')).toBeVisible();
      expect(await unreachable(page), 'joining with the paste field open').toEqual([]);
    });
  });
}
