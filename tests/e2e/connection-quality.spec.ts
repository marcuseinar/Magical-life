import { expect, test } from '@playwright/test';
import { startGame } from './support';

/*
 * The connection-quality chip, against a real `RTCDataChannel`: nothing
 * shown in solo play, "Direct connection" once a table is actually
 * connected. The "lost" state itself — `GameStore.linkState` reacting to a
 * transport's `onStateChange` — is covered exhaustively and fast in
 * `gameStore.svelte.test.ts` with a fake `Transport`; that is deliberate,
 * not a gap. A real peer's ICE failure has no bounded timeout the way the
 * app's own *connecting* phase does (ADR 0004) — the browser is in no
 * hurry to declare an established connection dead — so waiting for one to
 * happen organically here would be a slow, load-sensitive test standing in
 * for logic the unit tests already prove deterministically.
 */

test('shows direct once a real table connection is up, and nothing before that', async ({
  browser
}) => {
  const hostContext = await browser.newContext();
  const joinContext = await browser.newContext();
  const host = await hostContext.newPage();
  const joiner = await joinContext.newPage();

  await startGame(host, /commander/i, 2);

  // Solo play never tracks a connection at all.
  await expect(host.getByRole('status', { name: /direct connection/i })).toHaveCount(0);

  await host.getByRole('button', { name: 'Connect a table' }).click();
  await host.getByRole('button', { name: 'Invite Player 2' }).click();
  await host.getByRole('button', { name: /paste instead/i }).click();

  const hostCode = host.locator('.sheet textarea.code[readonly]');
  await expect(hostCode).not.toHaveValue('', { timeout: 10_000 });
  const offerCode = await hostCode.inputValue();

  await joiner.goto('/join');
  await joiner.getByRole('button', { name: /paste instead/i }).click();
  await joiner.getByLabel('Their code').fill(offerCode);
  await joiner.getByRole('button', { name: 'Continue' }).click();
  await joiner.getByRole('button', { name: 'Join' }).click();

  const replyCode = joiner.locator('textarea.code[readonly]');
  await expect(replyCode).not.toHaveValue('', { timeout: 10_000 });
  const answerCode = await replyCode.inputValue();

  await host.getByLabel('Paste their reply').fill(answerCode);
  await host.getByRole('button', { name: 'Connect', exact: true }).click();
  await expect(host.getByText('Connected.')).toBeVisible({ timeout: 10_000 });
  await host.getByRole('button', { name: 'Done' }).click();

  await expect(host.getByRole('status', { name: /direct connection/i })).toBeVisible({
    timeout: 10_000
  });

  await hostContext.close();
  await joinContext.close();
});
