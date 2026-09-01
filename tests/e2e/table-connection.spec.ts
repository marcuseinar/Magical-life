import { expect, test } from '@playwright/test';
import { COMMITTED, startGame } from './support';

/*
 * The real thing, not the spike: two independent browser contexts, standing
 * in for two separate phones, connect over an actual WebRTC channel using
 * only a pasted code — no QR, no server, exactly the mechanism the spike in
 * spikes/webrtc-handshake/ proved before any of this UI existed. This is
 * the manual fallback specifically; the short-code path built on top of it
 * has its own journey in table-connection-by-code.spec.ts.
 */

test('a joined table converges to the same game, in both directions', async ({ browser }) => {
  const hostContext = await browser.newContext();
  const joinContext = await browser.newContext();
  const host = await hostContext.newPage();
  const joiner = await joinContext.newPage();

  await startGame(host, /commander/i, 2);

  await host.getByRole('button', { name: 'Connect a table' }).click();
  await host.getByRole('button', { name: 'Invite Player 2' }).click();
  // The short code is the default path now; this journey exercises its
  // manual-paste fallback specifically.
  await host.getByRole('button', { name: /paste instead/i }).click();

  const hostCode = host.locator('.sheet textarea.code[readonly]');
  await expect(hostCode).not.toHaveValue('', { timeout: 10_000 });
  const offerCode = await hostCode.inputValue();

  await joiner.goto('/join');
  await joiner.getByRole('button', { name: /paste instead/i }).click();
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

  /*
   * Joining claims the seat, and a claimed seat leaves the grid for the
   * opponent bar instead — proven here once, since claiming happens in
   * `tableConnection.svelte.ts`, shared by every join path including the
   * short-code one in table-connection-by-code.spec.ts. This is a
   * two-player game, so each device is also down to exactly one seat of
   * its own; the case where several local seats remain is its own test
   * below, since a two-player game cannot exercise it.
   */
  const hostOpponents = host.getByRole('group', { name: /opponents/i });
  // The claim itself has to cross the wire before the host's board reflects
  // it, unlike the joiner's own view of the host below.
  await expect(hostOpponents.getByLabel('Player 2: 40 life')).toBeVisible({ timeout: 10_000 });
  await expect(host.getByRole('button', { name: 'Player 2, lose one life' })).toHaveCount(0);
  await expect(host.getByRole('button', { name: 'Player 1, lose one life' })).toBeEnabled();

  const joinerOpponents = joiner.getByRole('group', { name: /opponents/i });
  await expect(joinerOpponents.getByLabel('Player 1: 40 life')).toBeVisible();
  await expect(joiner.getByRole('button', { name: 'Player 1, lose one life' })).toHaveCount(0);
  await expect(joiner.getByRole('button', { name: 'Player 2, lose one life' })).toBeEnabled();

  // A change on the host reaches the joiner, in the opponent bar rather than
  // a panel of its own.
  await host.getByRole('button', { name: 'Player 1, lose one life' }).click();
  await expect(joinerOpponents.getByLabel('Player 1: 39 life')).toBeVisible({
    timeout: COMMITTED + 5000
  });

  // And a change on the joiner reaches the host — the point of this being a
  // connection and not a one-way broadcast.
  await joiner.getByRole('button', { name: 'Player 2, gain one life' }).click();
  await expect(hostOpponents.getByLabel('Player 2: 41 life')).toBeVisible({
    timeout: COMMITTED + 5000
  });

  await hostContext.close();
  await joinContext.close();
});

test('a claimed seat leaves the grid even while several local seats remain', async ({
  browser
}) => {
  const hostContext = await browser.newContext();
  const joinContext = await browser.newContext();
  const host = await hostContext.newPage();
  const joiner = await joinContext.newPage();

  await startGame(host, /commander/i, 3);

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

  /*
   * Three seats, one claimed: the host still plays two of its own, and
   * both stay full panels. It is claiming a seat that moves it to the bar,
   * never a headcount of how many are left — a host down to two local
   * seats is not the single-seat shape the test above exercises.
   */
  await expect(
    host.getByRole('group', { name: /opponents/i }).getByLabel('Player 2: 40 life')
  ).toBeVisible({ timeout: 10_000 });
  await expect(host.getByRole('button', { name: 'Player 1, lose one life' })).toBeEnabled();
  await expect(host.getByRole('button', { name: 'Player 3, lose one life' })).toBeEnabled();
  await expect(host.getByRole('button', { name: 'Player 2, lose one life' })).toHaveCount(0);

  await hostContext.close();
  await joinContext.close();
});
