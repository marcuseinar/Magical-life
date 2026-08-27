import { expect, test } from '@playwright/test';
import { COMMITTED, startGame } from './support';

/*
 * The short-code path, against the real signalling worker (workers/signalling/,
 * run locally by Playwright's second webServer — see playwright.config.ts).
 * Two independent browser contexts, standing in for two phones: the host
 * never pastes a reply, and the joiner arrives by tapping a link — the
 * `?code=` a QR or a text message would actually carry — rather than typing
 * anything.
 */

test('a joined table converges to the same game, arriving by the short-code link', async ({
  browser
}) => {
  const hostContext = await browser.newContext();
  const joinContext = await browser.newContext();
  const host = await hostContext.newPage();
  const joiner = await joinContext.newPage();

  await startGame(host, /commander/i, 2);

  await host.getByRole('button', { name: 'Connect a table' }).click();
  await host.getByRole('button', { name: 'Invite Player 2' }).click();

  const shortCode = host.locator('.sheet p.short-code');
  await expect(shortCode).toBeVisible({ timeout: 10_000 });
  const code = (await shortCode.textContent())?.trim();
  expect(code).toMatch(/^[A-Z0-9]{4}$/);

  const linkField = host.locator('.sheet textarea.code[readonly]');
  const link = await linkField.inputValue();
  expect(link).toContain(`code=${code}`);

  // Arriving by the link is the point: no code typed by hand, no reply
  // pasted back — the worker carries the whole exchange.
  await joiner.goto(link.replace(/^https?:\/\/[^/]+/, ''));
  await expect(joiner.getByText('Join as')).toContainText('Player 2');
  await joiner.getByRole('button', { name: 'Join' }).click();

  await expect(host.getByText('Connected.')).toBeVisible({ timeout: 10_000 });
  await host.getByRole('button', { name: 'Done' }).click();
  await expect(joiner.getByLabel('Player 1: 40 life')).toBeVisible({ timeout: 10_000 });
  await expect(joiner.getByLabel('Player 2: 40 life')).toBeVisible();

  // A change on the host reaches the joiner.
  await host.getByRole('button', { name: 'Player 1, lose one life' }).click();
  await expect(joiner.getByLabel('Player 1: 39 life')).toBeVisible({ timeout: COMMITTED + 5000 });

  // And a change on the joiner reaches the host.
  await joiner.getByRole('button', { name: 'Player 2, gain one life' }).click();
  await expect(host.getByLabel('Player 2: 41 life')).toBeVisible({ timeout: COMMITTED + 5000 });

  await hostContext.close();
  await joinContext.close();
});

test('a joiner can type the short code by hand instead of following a link', async ({
  browser
}) => {
  const hostContext = await browser.newContext();
  const joinContext = await browser.newContext();
  const host = await hostContext.newPage();
  const joiner = await joinContext.newPage();

  await startGame(host, /commander/i, 2);

  await host.getByRole('button', { name: 'Connect a table' }).click();
  await host.getByRole('button', { name: 'Invite Player 2' }).click();

  const shortCode = host.locator('.sheet p.short-code');
  await expect(shortCode).toBeVisible({ timeout: 10_000 });
  const code = (await shortCode.textContent())?.trim();

  await joiner.goto('/join');
  await joiner.getByLabel('Short code').fill(code ?? '');
  await joiner.getByRole('button', { name: 'Continue' }).click();
  await expect(joiner.getByText('Join as')).toContainText('Player 2');
  await joiner.getByRole('button', { name: 'Join' }).click();

  await expect(host.getByText('Connected.')).toBeVisible({ timeout: 10_000 });

  await hostContext.close();
  await joinContext.close();
});
