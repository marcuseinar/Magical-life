import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { MAX_BLAME_STEP_PX, blameIndex, blameStepPx } from './blameStep';

/** The narrowest a player card gets: six seats on a 320px screen. */
const NARROWEST_CARD_PX = 148;

/* Nobody, plus at most five opponents: the app seats six. */
const candidates = () => fc.integer({ min: 1, max: 6 });
/* The finger always has at least half the card to travel in, because the step
   is sized against the wider side of wherever it landed. */
const room = () => fc.integer({ min: NARROWEST_CARD_PX / 2, max: 600 });

describe('blame step', () => {
  it('never asks for a longer reach than a comfortable thumb', () => {
    fc.assert(
      fc.property(room(), candidates(), (px, count) => {
        expect(blameStepPx(px, count)).toBeLessThanOrEqual(MAX_BLAME_STEP_PX);
      })
    );
  });

  it('always leaves a step to travel, even pressed hard against the edge', () => {
    fc.assert(
      fc.property(fc.integer({ min: -50, max: 600 }), candidates(), (px, count) => {
        expect(blameStepPx(px, count)).toBeGreaterThan(0);
      })
    );
  });

  /* This is the bug the table found: at six players a fixed 44px step needed
     264px of travel inside a 248px card, so the last seats could not be
     reached at all. Every candidate has to be within the room available. */
  it('puts every candidate within reach of the room the finger has', () => {
    fc.assert(
      fc.property(room(), candidates(), (px, count) => {
        const step = blameStepPx(px, count);
        expect(blameIndex(px, step, count)).toBe(count - 1);
      })
    );
  });

  it('reaches every candidate in between, and skips none', () => {
    fc.assert(
      fc.property(room(), candidates(), (px, count) => {
        const step = blameStepPx(px, count);
        const reached = new Set<number>();
        for (let travelled = 0; travelled <= px; travelled += 1) {
          reached.add(blameIndex(travelled, step, count));
        }
        expect([...reached].sort((a, b) => a - b)).toEqual(
          Array.from({ length: count }, (_, i) => i)
        );
      })
    );
  });

  it('blames nobody until the finger has actually moved', () => {
    expect(blameIndex(0, MAX_BLAME_STEP_PX, 6)).toBe(0);
  });

  /* Losing life is a press on the minus zone, which is the left half of the
     card — but a scrub down from the plus zone starts on the right. Whichever
     way there is room to travel, the list has to run. */
  it('runs the list whichever way the finger has room to go', () => {
    const step = blameStepPx(200, 4);
    expect(blameIndex(-200, step, 4)).toBe(blameIndex(200, step, 4));
  });

  it('never points past the end of the list', () => {
    fc.assert(
      fc.property(fc.integer({ min: -2000, max: 2000 }), candidates(), (travelled, count) => {
        const index = blameIndex(travelled, blameStepPx(200, count), count);
        expect(index).toBeGreaterThanOrEqual(0);
        expect(index).toBeLessThanOrEqual(count - 1);
      })
    );
  });
});
