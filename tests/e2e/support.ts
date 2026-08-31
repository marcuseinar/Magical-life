import { expect } from '@playwright/test';
import type { Page } from '@playwright/test';

/** The commit window plus a margin, so a pending change has certainly landed. */
export const COMMITTED = 3600;

/**
 * A pending change is on the total the moment it is made, but reaches the
 * event log only when its window runs out. Anything testing the log — a
 * reload, an undo, the history — has to wait for that, and the badge going
 * away is the signal: it exists only while something is still pending.
 */
export const settled = (page: Page) =>
  expect(page.getByRole('button', { name: /cancel pending change/i })).toHaveCount(0, {
    timeout: COMMITTED
  });

export async function startGame(page: Page, format: RegExp, players: number) {
  await page.goto('/');
  await page.getByRole('button', { name: format }).click();
  await page.getByRole('button', { name: String(players), exact: true }).click();
  await page.getByRole('button', { name: /begin at/i }).click();
}

export const lifeOf = (page: Page, name: string) =>
  page.getByLabel(new RegExp(`^${name}: -?\\d+ life$`));

export const readLife = async (page: Page, name: string) => {
  const label = await lifeOf(page, name).getAttribute('aria-label');
  return Number(/(-?\d+) life/.exec(label ?? '')?.[1]);
};

/** Polls, because a committed change reaches the DOM a tick after the gesture ends. */
export const expectLife = (page: Page, name: string) =>
  expect.poll(() => readLife(page, name), { timeout: 5000 });

export const zone = (page: Page, name: string, direction: 'lose' | 'gain') =>
  page.getByRole('button', { name: `${name}, ${direction} one life` });

/** A vertical scrub on a panel: press, drag, release. */
export async function scrub(page: Page, name: string, pixels: number) {
  const target = zone(page, name, pixels < 0 ? 'lose' : 'gain');
  const box = (await target.boundingBox())!;
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;

  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x, y - pixels, { steps: 12 });
  await page.mouse.up();
}
