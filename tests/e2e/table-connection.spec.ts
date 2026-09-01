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
   * Joining claims the seat. In a two-player game that leaves each device
   * playing exactly one seat, so the grid collapses to that one panel and
   * the opponent bar takes the other — proven here once, since claiming
   * happens in `tableConnection.svelte.ts`, shared by every join path
   * including the short-code one in table-connection-by-code.spec.ts. The
   * disabled-panel-in-the-grid case is for a local pod with a remote seat
   * mixed in, a different table shape than this test sets up.
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
