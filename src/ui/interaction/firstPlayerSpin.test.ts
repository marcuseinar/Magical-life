import { describe, expect, it } from 'vitest';
import { SPIN_MS, firstPlayerSpin } from './firstPlayerSpin';

const total = (steps: { delayMs: number }[]) => steps.reduce((sum, s) => sum + s.delayMs, 0);

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
    for (let count = 1; count <= 6; count++) {
      for (const step of firstPlayerSpin(count, count - 1)) {
        expect(step.index).toBeGreaterThanOrEqual(0);
        expect(step.index).toBeLessThan(count);
      }
    }
  });

  it('passes every seat at least once, so nobody looks skipped', () => {
    for (let count = 2; count <= 6; count++) {
      const seen = new Set(firstPlayerSpin(count, 0).map((step) => step.index));
      expect(seen.size, `count ${count}`).toBe(count);
    }
  });

  it('slows down as it goes, rather than stopping dead', () => {
    const steps = firstPlayerSpin(4, 2);
    for (let i = 1; i < steps.length; i++) {
      expect(steps[i]!.delayMs).toBeGreaterThanOrEqual(steps[i - 1]!.delayMs);
    }
    // The last pause is the dramatic one.
    expect(steps.at(-1)!.delayMs).toBeGreaterThan(steps[0]!.delayMs * 3);
  });

  it('takes the same time whoever wins, so the length gives nothing away', () => {
    const durations = [0, 1, 2, 3].map((chosen) => total(firstPlayerSpin(4, chosen)));
    for (const duration of durations) expect(duration).toBeCloseTo(SPIN_MS, 0);
  });

  it('takes the same time however many are playing', () => {
    for (let count = 2; count <= 6; count++) {
      expect(total(firstPlayerSpin(count, 0))).toBeCloseTo(SPIN_MS, 0);
    }
  });

  it('is over quickly enough to use every game', () => {
    expect(SPIN_MS).toBeLessThanOrEqual(2600);
    expect(SPIN_MS).toBeGreaterThanOrEqual(1200);
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
  });
});
