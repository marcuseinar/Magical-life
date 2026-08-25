import { describe, expect, it } from 'vitest';
import { MIN_STEP_MS, SPIN_MS, WINNER_BLINK_MS, firstPlayerSpin } from './firstPlayerSpin';

const total = (steps: { delayMs: number }[]) => steps.reduce((sum, s) => sum + s.delayMs, 0);
const seatCounts = [2, 3, 4, 5, 6];

describe('first player spin', () => {
  it('always lands on the player the domain already chose', () => {
    for (let count = 1; count <= 6; count++) {
      for (let chosen = 0; chosen < count; chosen++) {
        const steps = firstPlayerSpin(count, chosen);
        expect(steps.at(-1)?.index, `count ${count}, chosen ${chosen}`).toBe(chosen);
      }
    }
  });

  it('only ever highlights a seat that exists', () => {
    for (const count of seatCounts) {
      for (const step of firstPlayerSpin(count, count - 1)) {
        expect(step.index).toBeGreaterThanOrEqual(0);
        expect(step.index).toBeLessThan(count);
      }
    }
  });

  it('passes every seat at least once, so nobody looks skipped', () => {
    for (const count of seatCounts) {
      const seen = new Set(firstPlayerSpin(count, 0).map((step) => step.index));
      expect(seen.size, `count ${count}`).toBe(count);
    }
  });

  /*
   * The first version distributed a fixed total across however many steps the
   * seat count happened to produce. At six seats that made the opening steps
   * 1–40ms — shorter than a frame — so the fast phase was not fast, it was
   * invisible, and the whole reveal read as a blur followed by a crawl.
   */
  it('never takes a step too short to see', () => {
    for (const count of seatCounts) {
      for (let chosen = 0; chosen < count; chosen++) {
        for (const step of firstPlayerSpin(count, chosen)) {
          expect(step.delayMs, `count ${count}, chosen ${chosen}`).toBeGreaterThanOrEqual(
            MIN_STEP_MS
          );
        }
      }
    }
  });

  it('opens with a genuine flurry rather than one or two quick frames', () => {
    for (const count of seatCounts) {
      const steps = firstPlayerSpin(count, 0);
      const brisk = steps.filter((step) => step.delayMs <= MIN_STEP_MS * 1.8);
      expect(brisk.length, `count ${count} had only ${brisk.length} brisk steps`).toBeGreaterThan(
        6
      );
    }
  });

  it('has enough steps at any seat count to read as a spin', () => {
    for (const count of seatCounts) {
      expect(firstPlayerSpin(count, 0).length, `count ${count}`).toBeGreaterThanOrEqual(15);
    }
  });

  it('slows down markedly, ending on a long pause', () => {
    for (const count of seatCounts) {
      const steps = firstPlayerSpin(count, count - 1);
      for (let i = 1; i < steps.length; i++) {
        expect(steps[i]!.delayMs).toBeGreaterThanOrEqual(steps[i - 1]!.delayMs);
      }
      expect(steps.at(-1)!.delayMs).toBeGreaterThan(steps[0]!.delayMs * 5);
      expect(steps.at(-1)!.delayMs).toBeGreaterThan(300);
      // Dramatic, not interminable.
      expect(steps.at(-1)!.delayMs).toBeLessThan(1100);
    }
  });

  it('takes the same time whoever wins, so the length gives nothing away', () => {
    for (const chosen of [0, 1, 2, 3]) {
      expect(total(firstPlayerSpin(4, chosen))).toBeCloseTo(SPIN_MS, 0);
    }
  });

  it('takes the same time however many are playing', () => {
    for (const count of seatCounts) {
      expect(total(firstPlayerSpin(count, 0))).toBeCloseTo(SPIN_MS, 0);
    }
  });

  it('is over quickly enough to use every game', () => {
    expect(SPIN_MS).toBeLessThanOrEqual(2800);
    expect(SPIN_MS).toBeGreaterThanOrEqual(1500);
  });

  it('blinks the winner for long enough to notice, briefly enough not to nag', () => {
    expect(WINNER_BLINK_MS).toBeGreaterThanOrEqual(600);
    expect(WINNER_BLINK_MS).toBeLessThanOrEqual(1500);
    // Three blinks, so the CSS iteration count has to divide it evenly.
    expect(WINNER_BLINK_MS % 3).toBe(0);
  });

  it('does not put on a show for a single player', () => {
    expect(firstPlayerSpin(1, 0)).toEqual([{ index: 0, delayMs: 0 }]);
  });

  it('goes straight to the answer when motion is unwelcome', () => {
    expect(firstPlayerSpin(4, 2, { reducedMotion: true })).toEqual([{ index: 2, delayMs: 0 }]);
  });

  it('is deterministic — the drama is theatre, the result is already decided', () => {
    expect(firstPlayerSpin(5, 3)).toEqual(firstPlayerSpin(5, 3));
  });

  it('survives a nonsensical seat count without throwing', () => {
    expect(firstPlayerSpin(0, 0)).toEqual([{ index: 0, delayMs: 0 }]);
    expect(firstPlayerSpin(4, 99).at(-1)?.index).toBe(3);
    expect(firstPlayerSpin(4, -5).at(-1)?.index).toBe(0);
  });
});
