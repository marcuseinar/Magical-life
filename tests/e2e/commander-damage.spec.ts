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
  await startGame(page, /commander/i, 4);
  await zone(page, 'Player 1', 'lose').click();

  const group = page.getByRole('group', { name: /whose commander/i });
  const sizes = await group.getByRole('button').evaluateAll((buttons) =>
    buttons.map((button) => {
      const box = button.getBoundingClientRect();
      return Math.min(box.width, box.height);
    })
  );
  expect(sizes.length).toBeGreaterThan(1);

  /* 44px is the touch target; the slack is for sub-pixel layout arithmetic, not
     for a smaller chip. WebKit measures a 2.75rem box as 43.99998474121094. */
  const SUB_PIXEL = 0.01;
  for (const size of sizes) expect(size).toBeGreaterThanOrEqual(44 - SUB_PIXEL);
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
test('can reach the far end of the row by drag, at six players', async ({ page }) => {
  await startGame(page, /commander/i, 6);

  // A near-row seat, so down the screen is down from that player's seat too.
  const panel = page.locator('article[data-rotated="false"]').first();
  const name = (await panel
    .getByRole('button', { name: /lose one life/i })
    .getAttribute('aria-label'))!.split(',')[0]!;

  const box = (await panel.getByRole('button', { name: /lose one life/i }).boundingBox())!;
  const card = (await panel.boundingBox())!;
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;

  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x, y + 90, { steps: 8 });

  // As far sideways as this card physically allows, and no further.
  await page.mouse.move(card.x + card.width - 1, y + 90, { steps: 12 });

  const group = page.getByRole('group', { name: new RegExp(`dealt this to ${name}`, 'i') });
  const last = (await group.getByRole('button').all()).at(-1)!;
  await expect(last).toHaveAttribute('aria-pressed', 'true');

  await page.mouse.up();
});

/* Rule 10 says nothing scrolls; the row is the sanctioned local exception,
   because its length is set by the size of the table rather than the screen. */
test('the row can be panned by hand when it outruns the card', async ({ page }) => {
  await startGame(page, /commander/i, 6);

  const panel = page.locator('article[data-rotated="false"]').first();
  await panel.getByRole('button', { name: /lose one life/i }).click();

  const row = panel.locator('.blame__row');
  await expect(row).toBeVisible();

  const panned = await row.evaluate((element) => {
    const style = getComputedStyle(element);
    element.scrollLeft = 999;
    return {
      touchAction: style.touchAction,
      overflows: element.scrollWidth > element.clientWidth,
      moved: element.scrollLeft > 0
    };
  });

  expect(panned.touchAction).toBe('pan-x');
  // If it ever stops overflowing the panning is moot, but it must not be stuck.
  if (panned.overflows) expect(panned.moved).toBe(true);
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
