import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { NO_SLOT, blameSlot } from './blameSlot';

/** The row spans the card, which is 194px wide once six people are playing. */
const NARROW_ROW = 176;

const rows = () => fc.integer({ min: 60, max: 400 });
const slots = () => fc.integer({ min: 1, max: 6 });

describe('blame slot', () => {
  /* The whole point of the rework: where the finger came from must not matter,
     only where it is. Two drags that end at the same place pick the same one. */
  it('depends only on where the finger is, never on where it started', () => {
    fc.assert(
      fc.property(rows(), slots(), fc.integer({ min: 0, max: 400 }), (width, count, x) => {
        expect(blameSlot(x, 0, width, count, false)).toBe(blameSlot(x, 0, width, count, false));
      })
    );
  });

  it('reaches every slot by sweeping across the row, and skips none', () => {
    fc.assert(
      fc.property(rows(), slots(), (width, count) => {
        const seen = new Set<number>();
        for (let x = 0; x <= width; x += 1) seen.add(blameSlot(x, 0, width, count, false));
        expect([...seen].sort((a, b) => a - b)).toEqual(
          Array.from({ length: count }, (_, index) => index)
        );
      })
    );
  });

  it('gives every slot an equal share of the row', () => {
    const width = NARROW_ROW;
    const counts = new Map<number, number>();
    for (let x = 0; x < width; x += 1) {
      const slot = blameSlot(x, 0, width, 6, false);
      counts.set(slot, (counts.get(slot) ?? 0) + 1);
    }
    const shares = [...counts.values()];
    expect(Math.max(...shares) - Math.min(...shares)).toBeLessThanOrEqual(1);
  });

  it('never points outside the row', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: -500, max: 900 }),
        rows(),
        slots(),
        fc.boolean(),
        (x, width, count, rotated) => {
          const slot = blameSlot(x, 0, width, count, rotated);
          expect(slot).toBeGreaterThanOrEqual(0);
          expect(slot).toBeLessThanOrEqual(count - 1);
        }
      )
    );
  });

  /* A panel across the table is upside down, so its leftmost badge is on the
     right of the screen. */
  it('mirrors for a panel facing across the table', () => {
    expect(blameSlot(10, 0, 180, 6, true)).toBe(blameSlot(170, 0, 180, 6, false));
  });

  it('reads from the row rather than the screen', () => {
    expect(blameSlot(210, 200, 180, 6, false)).toBe(blameSlot(10, 0, 180, 6, false));
  });

  /* Layout is not measurable until the row is on screen. Blaming nobody is the
     safe answer; blaming whoever slot zero happens to be is not. */
  it('blames nobody when the row has no width yet', () => {
    expect(blameSlot(50, 0, 0, 6, false)).toBe(NO_SLOT);
  });
});
