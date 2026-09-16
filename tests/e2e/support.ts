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
  // With no game yet, `/` sends the player to `/setup` (ADR 0005).
  await page.getByRole('button', { name: format }).click();
  await page.getByRole('button', { name: String(players), exact: true }).click();
  await page.getByRole('button', { name: /begin at/i }).click();
}

/** Rematch and New game moved off the toolbar and behind Menu (ADR 0005). */
export const openMenu = (page: Page) => page.getByRole('button', { name: 'Menu' }).click();

export async function rematch(page: Page) {
  await openMenu(page);
  await page.getByRole('button', { name: 'Rematch' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Rematch' }).click();
}

/**
 * The table sheet. Reached from the toolbar now rather than a link beneath it,
 * and its accessible name grows a count once seats are claimed — so match the
 * start of it rather than the whole thing.
 */
export const openTable = (page: Page) => page.getByRole('button', { name: /^Table/ }).click();

/**
 * The host's no-server path. The table's own code is one for everybody now,
 * so the per-seat handshake — inherently one offer per scanner — asks whose
 * seat it is for first.
 */
export async function inviteBySeat(page: Page, seat: string) {
  await page.getByRole('button', { name: /paste instead/i }).click();
  await page.getByRole('button', { name: `Invite ${seat}` }).click();
}

/**
 * The joiner's no-server path. Every way in sits on one screen now, so the
 * paste field is revealed rather than a mode reached through the others —
 * and the host's own "use a code you paste instead" in the table sheet is a
 * different button with a similar name, which is why this names its own in
 * full.
 */
export async function joinByPastedCode(page: Page, offerCode: string) {
  await page.getByRole('button', { name: 'Paste a code instead' }).click();
  await page.getByLabel('Their code').fill(offerCode);
  await page.getByRole('button', { name: 'Use this code' }).click();
}

/** Opens the setup screen over the running game, without starting anything. */
export async function openNewGame(page: Page) {
  await openMenu(page);
  await page.getByRole('button', { name: 'New game' }).click();
  await expect(page.getByRole('button', { name: /begin at/i })).toBeVisible();
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
