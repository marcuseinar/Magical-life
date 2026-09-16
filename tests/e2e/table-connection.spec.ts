import { expect, test } from '@playwright/test';
import {
  COMMITTED,
  expectLife,
  inviteBySeat,
  joinByPastedCode,
  openMenu,
  openTable,
  rematch,
  settled,
  shownCode,
  startGame
} from './support';

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

  await openTable(host);
  await inviteBySeat(host, 'Player 2');

  const offerCode = await shownCode(host);

  await joiner.goto('/join');
  await joinByPastedCode(joiner, offerCode);
  await expect(joiner.getByText('Join as')).toContainText('Player 2');
  await joiner.getByRole('button', { name: 'Join' }).click();

  const answerCode = await shownCode(joiner, 'p.code');

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

test('a claimed seat leaves the grid, and a rematch does not hand it back', async ({ browser }) => {
  const hostContext = await browser.newContext();
  const joinContext = await browser.newContext();
  const host = await hostContext.newPage();
  const joiner = await joinContext.newPage();

  await startGame(host, /commander/i, 3);

  await openTable(host);
  await inviteBySeat(host, 'Player 2');

  const offerCode = await shownCode(host);

  await joiner.goto('/join');
  await joinByPastedCode(joiner, offerCode);
  await joiner.getByRole('button', { name: 'Join' }).click();

  const answerCode = await shownCode(joiner, 'p.code');

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

  /*
   * And a rematch is the same table playing again, not a new one: it resets
   * the totals and nothing about who is playing where. The host used to get
   * the joined seat back as a panel of its own here — playable from the
   * wrong phone, and a board that grew a player between games.
   */
  await host.getByRole('button', { name: 'Player 1, lose one life' }).click();
  await settled(host);
  await rematch(host);

  await expectLife(host, 'Player 1').toBe(40);
  await expect(
    host.getByRole('group', { name: /opponents/i }).getByLabel('Player 2: 40 life')
  ).toBeVisible();
  await expect(host.getByRole('button', { name: 'Player 2, lose one life' })).toHaveCount(0);
  await expect(host.getByRole('button', { name: 'Player 1, lose one life' })).toBeEnabled();
  await expect(host.getByRole('button', { name: 'Player 3, lose one life' })).toBeEnabled();

  // The joiner is looking at the fresh game too, still playing only its seat.
  await expectLife(joiner, 'Player 2').toBe(40);
  await expect(joiner.getByRole('button', { name: 'Player 2, lose one life' })).toBeEnabled();
  await expect(joiner.getByRole('button', { name: 'Player 1, lose one life' })).toHaveCount(0);

  await hostContext.close();
  await joinContext.close();
});

/*
 * Joining used to be reachable only from setup's "Join a table instead" —
 * so only from a device with no game of its own. A player already counting
 * their life had no route to it at all.
 */
test('reaches joining from the menu, without giving up the game already running', async ({
  page
}) => {
  await startGame(page, /commander/i, 4);
  await openMenu(page);
  await page.getByRole('button', { name: 'Join a table' }).click();

  await expect(page.getByRole('heading', { name: 'Join a table' })).toBeVisible();

  await page.getByRole('button', { name: /back to your own game/i }).click();
  await expect(page.getByLabel('Player 1: 40 life')).toBeVisible();
});

test('shows every way into a table at once, rather than one behind another', async ({ page }) => {
  await page.goto('/join');

  await expect(page.getByRole('button', { name: 'Scan a QR code' })).toBeVisible();
  await expect(page.getByLabel('Short code')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Paste a code instead' })).toBeVisible();

  // Revealing the last resort must not bury the other two, which is exactly
  // what the old "instead" chain did to scanning.
  await page.getByRole('button', { name: 'Paste a code instead' }).click();
  await expect(page.getByLabel('Their code')).toBeVisible();
  await expect(page.getByLabel('Short code')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Scan a QR code' })).toBeVisible();
});
