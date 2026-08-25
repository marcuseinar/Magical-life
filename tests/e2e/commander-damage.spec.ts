import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { COMMITTED, expectLife, readLife, startGame, zone } from './support';

const crown = (page: Page, name: string) =>
  page.getByRole('button', { name: `Commander damage to ${name}` });

test('tags life loss as commander damage in one gesture', async ({ page }) => {
  await startGame(page, /commander/i, 4);

  // Three taps of loss, blamed on Player 2's commander.
  for (let tap = 0; tap < 3; tap++) await zone(page, 'Player 1', 'lose').click();
  await page
    .getByRole('group', { name: /whose commander dealt this to player 1/i })
    .getByRole('button', { name: /player 2/i })
    .click();

  // One gesture, both numbers, and they cannot disagree.
  await expect(page.getByLabel('Player 1: 37 life')).toBeVisible({ timeout: COMMITTED });
  await expect(crown(page, 'Player 1')).toHaveText(/3/);
});

test('picks the commander from the same drag that sets the damage', async ({ page }) => {
  await startGame(page, /commander/i, 4);

  // Player 3 sits in the near row, so screen-down is down from their seat too.
  const zone = page.getByRole('button', { name: 'Player 3, lose one life' });
  const box = (await zone.boundingBox())!;
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;

  await page.mouse.move(x, y);
  await page.mouse.down();
  // Down for how much, sideways for whose commander — one gesture.
  await page.mouse.move(x, y + 120, { steps: 8 });
  // Two steps sideways along [nobody, Player 1, Player 2, …].
  await page.mouse.move(x + 88, y + 120, { steps: 8 });
  await expect(page.getByText(/'s commander$/)).toBeVisible();
  await page.mouse.up();

  // Released deliberately, so it commits at once — but the DOM catches up a
  // tick later.
  await expectLife(page, 'Player 3').toBeLessThan(35);
  const life = await readLife(page, 'Player 3');
  // Whatever life it cost, the commander was charged exactly the same.
  await expect(crown(page, 'Player 3')).toHaveText(new RegExp(`\\b${40 - life}\\b`));
});

test('offers a target big enough to hit', async ({ page }) => {
  await startGame(page, /commander/i, 6);
  await zone(page, 'Player 1', 'lose').click();

  const group = page.getByRole('group', { name: /whose commander/i });
  const boxes = await group
    .getByRole('button')
    .evaluateAll((buttons) => buttons.map((b) => b.getBoundingClientRect()))
    .then((rects) => rects.map((r) => ({ w: r.width, h: r.height })));

  expect(boxes).toHaveLength(6);

  /* The button is a full column of the row, so its width is the share of the
     card it owns — 194px between six people does not leave 44px each, and a
     badge you have to pan to reach is worse than a small one you can see. The
     height carries the touch target instead. The slack is for sub-pixel layout
     arithmetic: WebKit measures a 2.75rem box as 43.99998474121094. */
  const SUB_PIXEL = 0.01;
  for (const box of boxes) {
    expect(box.h).toBeGreaterThanOrEqual(44 - SUB_PIXEL);
    expect(box.w).toBeGreaterThan(24);
  }
});

/* The reel: the blamed place is brought to the middle and stays there while the
   others queue either side of it. The cost, stated plainly rather than hidden:
   not all six are on screen at once, because centring the blamed one pushes the
   far ends off the card. */
test('brings the blamed badge to the middle and queues the rest around it', async ({ page }) => {
  await startGame(page, /commander/i, 6);

  const panel = page.locator('article[data-rotated="false"]').first();
  const loseZone = panel.getByRole('button', { name: /lose one life/i });
  const name = (await loseZone.getAttribute('aria-label'))!.split(',')[0]!;
  const box = (await loseZone.boundingBox())!;
  const y = box.y + box.height / 2;

  await page.mouse.move(box.x + box.width / 2, y);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2, y + 100, { steps: 8 });

  const group = page.getByRole('group', { name: new RegExp(`dealt this to ${name}`, 'i') });
  const stage = (await group.boundingBox())!;
  const aimAt = (index: number, steps = 5) =>
    page.mouse.move(stage.x + (stage.width / 6) * (index + 0.5), y + 100, { steps });
  const settle = () =>
    group.evaluate((element) =>
      Promise.all(
        element.getAnimations({ subtree: true }).map((a) => a.finished.catch(() => undefined))
      )
    );

  const middleOf = (rect: { x: number; width: number }) => rect.x + rect.width / 2;

  for (const index of [0, 2, 5]) {
    await aimAt(index);
    await expect(group.getByRole('button').nth(index)).toHaveAttribute('aria-pressed', 'true');
    await settle();

    const aimed = (await group.getByRole('button').nth(index).boundingBox())!;
    expect(Math.abs(middleOf(aimed) - middleOf(stage))).toBeLessThan(4);
  }

  await page.mouse.up();
});

/* The number stays in the middle and the candidates travel through it. */
test('keeps the pending damage in the badge at the middle', async ({ page }) => {
  await startGame(page, /commander/i, 6);

  const panel = page.locator('article[data-rotated="false"]').first();
  const loseZone = panel.getByRole('button', { name: /lose one life/i });
  const name = (await loseZone.getAttribute('aria-label'))!.split(',')[0]!;
  const box = (await loseZone.boundingBox())!;
  const y = box.y + box.height / 2;

  await page.mouse.move(box.x + box.width / 2, y);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2, y + 100, { steps: 8 });

  const group = page.getByRole('group', { name: new RegExp(`dealt this to ${name}`, 'i') });
  const stage = (await group.boundingBox())!;
  const aimAt = (index: number, steps = 5) =>
    page.mouse.move(stage.x + (stage.width / 6) * (index + 0.5), y + 100, { steps });

  // Before aiming at anybody, the number rides on "not commander damage".
  await expect(group.getByRole('button').nth(0).locator('.blame__amount')).toHaveText(/^-\d+$/);

  await aimAt(3);
  await expect(group.getByRole('button').nth(3).locator('.blame__amount')).toHaveText(/^-\d+$/);
  await expect(group.locator('.blame__amount')).toHaveCount(1);

  await page.mouse.up();
});

/* The badges travel now, so the thing that must hold still is the frame the
   aiming reads. If the stage moved or resized as the reel slid, the finger's
   meaning would change under it and the reel would chase itself. */
test('the stage the aiming reads never moves as the reel slides', async ({ page }) => {
  await startGame(page, /commander/i, 6);

  const panel = page.locator('article[data-rotated="false"]').first();
  const loseZone = panel.getByRole('button', { name: /lose one life/i });
  const name = (await loseZone.getAttribute('aria-label'))!.split(',')[0]!;
  const box = (await loseZone.boundingBox())!;
  const y = box.y + box.height / 2;

  await page.mouse.move(box.x + box.width / 2, y);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2, y + 100, { steps: 8 });

  const group = page.getByRole('group', { name: new RegExp(`dealt this to ${name}`, 'i') });
  const stage = (await group.boundingBox())!;
  const aimAt = (index: number, steps = 5) =>
    page.mouse.move(stage.x + (stage.width / 6) * (index + 0.5), y + 100, { steps });

  const frame = async () => {
    const rect = (await group.boundingBox())!;
    return `${Math.round(rect.x)}:${Math.round(rect.width)}`;
  };

  const before = await frame();
  for (const index of [0, 1, 2, 3, 4, 5]) {
    await aimAt(index, 3);
    expect(await frame()).toBe(before);
  }

  await page.mouse.up();
});

/* It has to be bigger than its neighbours, or the number has nowhere to go. */
test('draws the aimed badge larger than the rest', async ({ page }) => {
  await startGame(page, /commander/i, 6);
  await zone(page, 'Player 1', 'lose').click();

  const painted = await page
    .getByRole('group', { name: /whose commander/i })
    .locator('.blame__badge')
    .evaluateAll((badges) => badges.map((badge) => badge.getBoundingClientRect().width));

  const [aimed, ...rest] = painted;
  for (const other of rest) expect(aimed!).toBeGreaterThan(other * 1.2);
});

/* Round, because a square badge eats the width its neighbours need. */
test('draws the badges as circles', async ({ page }) => {
  await startGame(page, /commander/i, 6);
  await zone(page, 'Player 1', 'lose').click();

  const radii = await page
    .getByRole('group', { name: /whose commander/i })
    .locator('.blame__badge')
    .evaluateAll((badges) =>
      badges.map((badge) => {
        const style = getComputedStyle(badge);
        const box = badge.getBoundingClientRect();
        return { radius: parseFloat(style.borderRadius), half: box.width / 2, box };
      })
    );

  expect(radii.length).toBe(6);
  for (const { radius, half, box } of radii) {
    expect(radius).toBeGreaterThanOrEqual(half - 0.5);
    expect(Math.abs(box.width - box.height)).toBeLessThan(1);
  }
});

for (const count of [4, 6]) {
  test(`the strip sits at the top, clear of the total, at ${count} players`, async ({ page }) => {
    await startGame(page, /commander/i, count);
    await zone(page, `Player ${count - 1}`, 'lose').click();

    // The strip drops in from above the card, so measure once it has landed
    // rather than after a guessed pause.
    await page
      .locator('.blame')
      .first()
      .evaluate((el) => Promise.all(el.getAnimations().map((a) => a.finished)));

    const geometry = await page.evaluate((n) => {
      const panel = [...document.querySelectorAll('article')][n - 2]!;
      const card = panel.getBoundingClientRect();
      const blame = panel.querySelector('.blame')!.getBoundingClientRect();
      const total = panel.querySelector('p.total')!.getBoundingClientRect();
      const plate = panel.querySelector('footer')!.getBoundingClientRect();
      const overlaps = (a: DOMRect, b: DOMRect) =>
        a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
      return {
        insideCard: blame.top >= card.top && blame.bottom <= card.bottom + 1,
        clearsTotal: !overlaps(blame, total),
        clearsPlate: !overlaps(blame, plate),
        // The gesture that opens this is a downward drag, so the hand is over
        // the bottom of the card. These must be above the total, not below it.
        aboveTheTotal: blame.bottom <= total.top
      };
    }, count);

    expect(geometry).toEqual({
      insideCard: true,
      clearsTotal: true,
      clearsPlate: true,
      aboveTheTotal: true
    });
  });
}

/* Reported from the table. Your own commander is not a thing that damages you
   in any ordinary game, so the chip was pure noise in the row you have to aim
   at mid-gesture. A stolen commander is corrected in the sheet instead. */
test('leaves the player themselves out of the row', async ({ page }) => {
  await startGame(page, /commander/i, 4);

  await zone(page, 'Player 1', 'lose').click();
  const group = page.getByRole('group', { name: /whose commander dealt this to player 1/i });

  await expect(group.getByRole('button', { name: /^player 1's commander$/i })).toHaveCount(0);
  // Nobody, plus the other three.
  await expect(group.getByRole('button')).toHaveCount(4);
});

/* The bug the table hit: a fixed 44px step per candidate wanted more travel
   than the card is wide once six people are playing, so the far end of the row
   could not be reached by the gesture at all. */
/* Absolute: a place on the stage means a place in the row, whatever the reel is
   showing. The finger chooses an index; the reel brings that index to the
   middle. Aiming at a badge could not work once badges travel — the one you
   aimed at would slide out from under you and hand your finger to its
   neighbour. */
test('maps each place on the stage to its own candidate, at six players', async ({ page }) => {
  await startGame(page, /commander/i, 6);

  const panel = page.locator('article[data-rotated="false"]').first();
  const loseZone = panel.getByRole('button', { name: /lose one life/i });
  const name = (await loseZone.getAttribute('aria-label'))!.split(',')[0]!;
  const box = (await loseZone.boundingBox())!;
  const y = box.y + box.height / 2;

  await page.mouse.move(box.x + box.width / 2, y);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2, y + 100, { steps: 8 });

  const group = page.getByRole('group', { name: new RegExp(`dealt this to ${name}`, 'i') });
  const stage = (await group.boundingBox())!;
  const aimAt = (index: number, steps = 5) =>
    page.mouse.move(stage.x + (stage.width / 6) * (index + 0.5), y + 100, { steps });

  const badges = await group.getByRole('button').all();
  expect(badges).toHaveLength(6);

  for (const [index, badge] of badges.entries()) {
    await aimAt(index);
    await expect(badge).toHaveAttribute('aria-pressed', 'true');
  }

  await page.mouse.up();
});

/* The complaint from the table: the same place on screen picked a different
   player depending on where the drag began. */
test('picks the same badge wherever the drag started', async ({ page }) => {
  await startGame(page, /commander/i, 6);

  const panel = page.locator('article[data-rotated="false"]').first();
  const loseZone = panel.getByRole('button', { name: /lose one life/i });
  const name = (await loseZone.getAttribute('aria-label'))!.split(',')[0]!;
  const box = (await loseZone.boundingBox())!;
  const card = (await panel.boundingBox())!;
  const y = box.y + box.height / 2;

  const group = page.getByRole('group', { name: new RegExp(`dealt this to ${name}`, 'i') });

  const aimedFrom = async (startX: number) => {
    await page.mouse.move(startX, y);
    await page.mouse.down();
    await page.mouse.move(startX, y + 90, { steps: 6 });

    // The same absolute place on the stage every time: the fifth of six.
    const stage = (await group.boundingBox())!;
    await page.mouse.move(stage.x + (stage.width / 6) * 4.5, y + 90, { steps: 6 });

    const pressed = await group
      .getByRole('button')
      .evaluateAll((buttons) =>
        buttons.findIndex((button) => button.getAttribute('aria-pressed') === 'true')
      );
    await page.mouse.up();
    return pressed;
  };

  expect(await aimedFrom(card.x + 8)).toBe(4);
  expect(await aimedFrom(card.x + card.width - 8)).toBe(4);
});

/* A straight drag down must not quietly blame whoever sits under the thumb. */
test('blames nobody for a drag that never moves sideways', async ({ page }) => {
  await startGame(page, /commander/i, 6);

  const panel = page.locator('article[data-rotated="false"]').first();
  const loseZone = panel.getByRole('button', { name: /lose one life/i });
  const name = (await loseZone.getAttribute('aria-label'))!.split(',')[0]!;
  const box = (await loseZone.boundingBox())!;
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;

  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x, y + 120, { steps: 10 });
  await page.mouse.up();

  await expect(crown(page, name)).not.toHaveText(/\d/);
});

test('leaves life loss untagged when nobody is blamed', async ({ page }) => {
  await startGame(page, /commander/i, 4);

  await zone(page, 'Player 1', 'lose').click();
  await expect(page.getByLabel('Player 1: 39 life')).toBeVisible({ timeout: COMMITTED });

  await expect(crown(page, 'Player 1')).not.toHaveText(/\d/);
});

test('asks nothing in a format where commander damage does not exist', async ({ page }) => {
  await startGame(page, /constructed/i, 2);

  await zone(page, 'Player 1', 'lose').click();
  await expect(page.getByRole('group', { name: /whose commander/i })).toHaveCount(0);
  await expect(crown(page, 'Player 1')).toHaveCount(0);
});

test('kills at twenty-one from one commander, on full life', async ({ page }) => {
  await startGame(page, /commander/i, 4);

  await crown(page, 'Player 1').click();
  const sheet = page.getByRole('dialog', { name: /commander damage to player 1/i });
  const fromTwo = sheet.getByRole('button', { name: /add one commander damage .* from player 2/i });
  for (let hit = 0; hit < 21; hit++) await fromTwo.click();

  await page.getByRole('button', { name: /close commander damage/i }).click();

  // Untouched life, but dead all the same.
  await expect(page.getByLabel('Player 1: 40 life')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Out', exact: true })).toBeVisible();
});

test('keeps each commander separate, because twenty-one is per commander', async ({ page }) => {
  await startGame(page, /commander/i, 4);

  await crown(page, 'Player 1').click();
  const sheet = page.getByRole('dialog', { name: /commander damage to player 1/i });
  for (let hit = 0; hit < 13; hit++) {
    await sheet.getByRole('button', { name: /add one commander damage .* from player 2/i }).click();
  }
  for (let hit = 0; hit < 12; hit++) {
    await sheet.getByRole('button', { name: /add one commander damage .* from player 3/i }).click();
  }
  await page.getByRole('button', { name: /close commander damage/i }).click();

  // Twenty-five in total, but neither commander has landed a lethal blow.
  await expect(crown(page, 'Player 1')).toHaveText(/13/);
  await expect(page.getByRole('button', { name: 'Out', exact: true })).toHaveCount(0);
});

test('corrects damage downwards without going negative', async ({ page }) => {
  await startGame(page, /commander/i, 4);

  await crown(page, 'Player 1').click();
  const sheet = page.getByRole('dialog', { name: /commander damage to player 1/i });
  const add = sheet.getByRole('button', { name: /add one commander damage .* from player 2/i });
  const remove = sheet.getByRole('button', {
    name: /remove one commander damage .* from player 2/i
  });

  await add.click();
  await add.click();
  await remove.click();
  // The total carries hidden text naming the source, so it reads as a sentence.
  await expect(sheet.getByText(/^1 from Player 2$/)).toBeVisible();

  await remove.click();
  // Nothing left to take away, so the control stops offering.
  await expect(remove).toBeDisabled();
});

test('survives a reload, like everything else in the log', async ({ page }) => {
  await startGame(page, /commander/i, 4);

  await crown(page, 'Player 1').click();
  const sheet = page.getByRole('dialog', { name: /commander damage to player 1/i });
  for (let hit = 0; hit < 7; hit++) {
    await sheet.getByRole('button', { name: /add one commander damage .* from player 2/i }).click();
  }
  await page.getByRole('button', { name: /close commander damage/i }).click();
  await expect(crown(page, 'Player 1')).toHaveText(/7/);

  await page.reload();
  await expect(crown(page, 'Player 1')).toHaveText(/7/);
});

test('is cleared by a rematch', async ({ page }) => {
  await startGame(page, /commander/i, 4);

  await crown(page, 'Player 1').click();
  const sheet = page.getByRole('dialog', { name: /commander damage to player 1/i });
  for (let hit = 0; hit < 5; hit++) {
    await sheet.getByRole('button', { name: /add one commander damage .* from player 2/i }).click();
  }
  await page.getByRole('button', { name: /close commander damage/i }).click();

  await page.getByRole('button', { name: 'Rematch' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Rematch' }).click();

  await expect(crown(page, 'Player 1')).not.toHaveText(/\d/);
});
