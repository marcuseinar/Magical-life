import { expect, test } from '@playwright/test';
import { startGame } from './support';

/**
 * A seeded random walk over the UI. It asserts nothing about intent and
 * everything about survival: no crash, no NaN, and whatever is on screen is
 * still there after a reload. The seed is printed on failure, so any run is
 * reproducible.
 */
const SEED = Number(process.env.MONKEY_SEED ?? 20_260_823);
const STEPS = 60;

const random = (seed: number) => () => {
  seed = (seed * 1664525 + 1013904223) >>> 0;
  return seed / 0x1_0000_0000;
};

test(`survives ${STEPS} random actions (seed ${SEED})`, async ({ page }) => {
  test.info().annotations.push({ type: 'seed', description: String(SEED) });
  await startGame(page, /commander/i, 4);

  const next = random(SEED);

  for (let step = 0; step < STEPS; step++) {
    const controls = await page.getByRole('button').all();
    const control = controls[Math.floor(next() * controls.length)];
    if (!control) continue;

    /*
     * The controls that leave the game screen entirely. This is a walk over a
     * game — its closing assertions read the panels — so wandering into setup
     * or settings ends the walk rather than testing anything. "End game" used
     * to be the only one; ADR 0005 replaced it with a menu that navigates.
     */
    const label = (await control.getAttribute('aria-label')) ?? (await control.textContent()) ?? '';
    if (/new game|settings|clear history/i.test(label)) continue;

    await control.click({ timeout: 2000, force: true }).catch(() => {});

    const body = (await page.locator('body').textContent()) ?? '';
    expect(body, `seed ${SEED}, step ${step}`).not.toContain('NaN');
    expect(body, `seed ${SEED}, step ${step}`).not.toContain('undefined');
  }

  await page.waitForTimeout(4600);
  const before = await page
    .locator('article')
    .evaluateAll((panels) => panels.map((panel) => panel.querySelector('p')?.textContent));

  await page.reload();
  await expect(page.locator('article').first()).toBeVisible();

  const after = await page
    .locator('article')
    .evaluateAll((panels) => panels.map((panel) => panel.querySelector('p')?.textContent));
  expect(after, `seed ${SEED}: state did not survive a reload`).toEqual(before);
});
