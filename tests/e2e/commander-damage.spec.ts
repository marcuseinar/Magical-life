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
  for (const size of sizes) expect(size).toBeGreaterThanOrEqual(44);
});

for (const count of [4, 6]) {
  test(`the strip stays clear of the total and the plate at ${count} players`, async ({ page }) => {
    await startGame(page, /commander/i, count);
    await zone(page, `Player ${count - 1}`, 'lose').click();

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
        clearsPlate: !overlaps(blame, plate)
      };
    }, count);

    // Wrapping the chips put three rows over the life total at six players, and
    // the caption over the name plate. One scrolling row keeps the height fixed.
    expect(geometry).toEqual({ insideCard: true, clearsTotal: true, clearsPlate: true });
  });
}

test('can blame the player themselves, for a commander that was stolen', async ({ page }) => {
  await startGame(page, /commander/i, 4);

  await zone(page, 'Player 1', 'lose').click();
  await page
    .getByRole('group', { name: /whose commander dealt this to player 1/i })
    .getByRole('button', { name: /^player 1's commander$/i })
    .click();

  await expect(page.getByLabel('Player 1: 39 life')).toBeVisible({ timeout: COMMITTED });
  await expect(crown(page, 'Player 1')).toHaveText(/\b1\b/);
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
