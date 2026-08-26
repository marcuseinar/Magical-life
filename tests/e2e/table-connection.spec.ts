import { expect, test } from '@playwright/test';
import { COMMITTED, startGame } from './support';

/*
 * The real thing, not the spike: two independent browser contexts, standing
 * in for two separate phones, connect over an actual WebRTC channel using
 * only a pasted code — no QR, no server, exactly the mechanism the spike in
 * spikes/webrtc-handshake/ proved before any of this UI existed.
 */

test('a joined table converges to the same game, in both directions', async ({ browser }) => {
  const hostContext = await browser.newContext();
  const joinContext = await browser.newContext();
  const host = await hostContext.newPage();
  const joiner = await joinContext.newPage();

  await startGame(host, /commander/i, 2);

  await host.getByRole('button', { name: 'Connect a table' }).click();
  await host.getByRole('button', { name: 'Invite Player 2' }).click();

  const hostCode = host.locator('.sheet textarea.code[readonly]');
  await expect(hostCode).not.toHaveValue('', { timeout: 10_000 });
  const offerCode = await hostCode.inputValue();

  await joiner.goto('/join');
  await joiner.getByLabel('Their code').fill(offerCode);
  await joiner.getByRole('button', { name: 'Continue' }).click();
  await expect(joiner.getByText('Join as')).toContainText('Player 2');
  await joiner.getByRole('button', { name: 'Join' }).click();

  const replyCode = joiner.locator('textarea.code[readonly]');
  await expect(replyCode).not.toHaveValue('', { timeout: 10_000 });
  const answerCode = await replyCode.inputValue();

  await host.getByLabel('Paste their reply').fill(answerCode);
  await host.getByRole('button', { name: 'Connect', exact: true }).click();

  // Both sides confirm the connection, and the joiner is now looking at a
  // real, playable copy of the same game — not a read-only preview of it.
  await expect(host.getByText('Connected.')).toBeVisible({ timeout: 10_000 });
  await host.getByRole('button', { name: 'Done' }).click();
  await expect(joiner.getByLabel('Player 1: 40 life')).toBeVisible({ timeout: 10_000 });
  await expect(joiner.getByLabel('Player 2: 40 life')).toBeVisible();

  // A change on the host reaches the joiner.
  await host.getByRole('button', { name: 'Player 1, lose one life' }).click();
  await expect(joiner.getByLabel('Player 1: 39 life')).toBeVisible({ timeout: COMMITTED + 5000 });

  // And a change on the joiner reaches the host — the point of this being a
  // connection and not a one-way broadcast.
  await joiner.getByRole('button', { name: 'Player 2, gain one life' }).click();
  await expect(host.getByLabel('Player 2: 41 life')).toBeVisible({ timeout: COMMITTED + 5000 });

  await hostContext.close();
  await joinContext.close();
});
