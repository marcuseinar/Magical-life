import { describe, expect, it } from 'vitest';
import {
  COMMIT_WINDOW_MS,
  CONTINUE_WINDOW_MS,
  PIXELS_PER_POINT,
  scrubPoints,
  stepDelta
} from './pendingDelta';
import type { DeltaState } from './pendingDelta';

const at = (now: number) => now;
const idle: DeltaState = null;

describe('pending delta', () => {
  it('starts idle', () => {
    expect(idle).toBeNull();
  });

  it('accumulates taps into one pending value', () => {
    let out = stepDelta(idle, { kind: 'nudge', by: -1, now: at(0) });
    out = stepDelta(out.state, { kind: 'nudge', by: -1, now: at(100) });
    out = stepDelta(out.state, { kind: 'nudge', by: -1, now: at(200) });

    expect(out.state?.value).toBe(-3);
    expect(out.commit).toBeNull();
  });

  it('pushes the commit deadline back on every new input', () => {
    const first = stepDelta(idle, { kind: 'nudge', by: -1, now: at(0) });
    expect(first.state?.deadline).toBe(COMMIT_WINDOW_MS);

    const second = stepDelta(first.state, { kind: 'nudge', by: -1, now: at(3000) });
    expect(second.state?.deadline).toBe(3000 + COMMIT_WINDOW_MS);
  });

  it('commits when the window elapses', () => {
    const pending = stepDelta(idle, { kind: 'nudge', by: -7, now: at(0) });
    const out = stepDelta(pending.state, { kind: 'tick', now: at(COMMIT_WINDOW_MS) });

    expect(out.commit).toBe(-7);
    expect(out.state).toBeNull();
  });

  it('does not commit early', () => {
    const pending = stepDelta(idle, { kind: 'nudge', by: -7, now: at(0) });
    const out = stepDelta(pending.state, { kind: 'tick', now: at(COMMIT_WINDOW_MS - 1) });

    expect(out.commit).toBeNull();
    expect(out.state?.value).toBe(-7);
  });

  it('ticking while idle does nothing', () => {
    expect(stepDelta(idle, { kind: 'tick', now: at(9999) })).toEqual({ state: null, commit: null });
  });

  it('cancels the whole pending value, which is the fastest undo there is', () => {
    const pending = stepDelta(idle, { kind: 'nudge', by: -7, now: at(0) });
    const out = stepDelta(pending.state, { kind: 'cancel' });

    expect(out.state).toBeNull();
    expect(out.commit).toBeNull();
  });

  it('cancelling while idle is harmless', () => {
    expect(stepDelta(idle, { kind: 'cancel' })).toEqual({ state: null, commit: null });
  });

  it('drops back to idle when taps cancel each other out', () => {
    let out = stepDelta(idle, { kind: 'nudge', by: -1, now: at(0) });
    out = stepDelta(out.state, { kind: 'nudge', by: +1, now: at(100) });

    expect(out.state).toBeNull();
    expect(out.commit).toBeNull();
  });

  it('scrubbing sets an absolute value rather than accumulating', () => {
    let out = stepDelta(idle, { kind: 'scrub', to: -5, now: at(0) });
    out = stepDelta(out.state, { kind: 'scrub', to: -12, now: at(50) });

    expect(out.state?.value).toBe(-12);
  });

  it('scrubbing back to zero clears the pending value', () => {
    const pending = stepDelta(idle, { kind: 'scrub', to: -5, now: at(0) });
    const out = stepDelta(pending.state, { kind: 'scrub', to: 0, now: at(50) });

    expect(out.state).toBeNull();
  });

  /*
   * Releasing a scrub does not commit it. A second drag started straight
   * after the first is one correction in two movements far more often than it
   * is two separate decisions — committing on release turned that into two
   * log entries and two undos. The value instead stays live for a short
   * window, so the next drag continues it, and commits on its own if none
   * comes.
   */
  it('keeps a released scrub live rather than committing it', () => {
    const pending = stepDelta(idle, { kind: 'scrub', to: -12, now: at(0) });
    const out = stepDelta(pending.state, { kind: 'release', now: at(10) });

    expect(out.commit).toBeNull();
    expect(out.state?.value).toBe(-12);
  });

  it('gives a released scrub the shorter continuation window, not the full one', () => {
    const pending = stepDelta(idle, { kind: 'scrub', to: -12, now: at(0) });
    const out = stepDelta(pending.state, { kind: 'release', now: at(10) });

    expect(out.state?.deadline).toBe(10 + CONTINUE_WINDOW_MS);
  });

  it('commits a released scrub once the continuation window runs out', () => {
    const pending = stepDelta(idle, { kind: 'scrub', to: -12, now: at(0) });
    const released = stepDelta(pending.state, { kind: 'release', now: at(10) });
    const out = stepDelta(released.state, { kind: 'tick', now: at(10 + CONTINUE_WINDOW_MS) });

    expect(out.commit).toBe(-12);
    expect(out.state).toBeNull();
  });

  it('lets a second scrub inside the window continue the first', () => {
    const first = stepDelta(idle, { kind: 'scrub', to: -12, now: at(0) });
    const released = stepDelta(first.state, { kind: 'release', now: at(10) });
    // The panel resumes from whatever is still pending, so the second drag
    // arrives as an absolute value built on the first.
    const second = stepDelta(released.state, {
      kind: 'scrub',
      to: released.state!.value - 5,
      now: at(400)
    });

    expect(second.commit).toBeNull();
    expect(second.state?.value).toBe(-17);
    // Back on the full window: the gesture is live again, not winding down.
    expect(second.state?.deadline).toBe(400 + COMMIT_WINDOW_MS);
  });

  it('flushes on demand, whatever is left of the window', () => {
    const pending = stepDelta(idle, { kind: 'nudge', by: -7, now: at(0) });
    const out = stepDelta(pending.state, { kind: 'flush' });

    expect(out.commit).toBe(-7);
    expect(out.state).toBeNull();
  });

  it('flushing nothing emits nothing, so flushing twice is harmless', () => {
    expect(stepDelta(idle, { kind: 'flush' })).toEqual({ state: null, commit: null });
  });

  it('releasing nothing emits nothing', () => {
    expect(stepDelta(idle, { kind: 'release', now: at(0) })).toEqual({ state: null, commit: null });
  });

  it('mixes tap and drag input in one pending value', () => {
    let out = stepDelta(idle, { kind: 'nudge', by: -3, now: at(0) });
    out = stepDelta(out.state, { kind: 'scrub', to: -20, now: at(50) });
    out = stepDelta(out.state, { kind: 'nudge', by: -1, now: at(100) });

    expect(out.state?.value).toBe(-21);
  });
});

/*
 * One rate, everywhere. The zoned curve this replaces meant the same finger
 * movement was worth different amounts depending on where in the gesture it
 * happened, which is impossible to aim with: the same movement had to be
 * worth the same thing wherever in the drag it fell.
 */
describe('scrub sensitivity', () => {
  it('is one point per twelve pixels', () => {
    expect(scrubPoints(PIXELS_PER_POINT)).toBe(1);
    expect(scrubPoints(PIXELS_PER_POINT * 4)).toBe(4);
    expect(scrubPoints(PIXELS_PER_POINT * 25)).toBe(25);
  });

  it('is zero for a movement too small to mean anything', () => {
    expect(scrubPoints(0)).toBe(0);
    expect(scrubPoints(PIXELS_PER_POINT - 1)).toBe(0);
  });

  it('does not accelerate: the second half of a drag is worth what the first was', () => {
    // Whole multiples of the step, so the flooring of a part-point does not
    // stand in for the acceleration this is actually checking for.
    expect(scrubPoints(240)).toBe(scrubPoints(120) * 2);
    expect(scrubPoints(960)).toBe(scrubPoints(480) * 2);
  });

  it('stays proportional over a long drag, so no distance runs away', () => {
    // Reported from real use, under the old curve: 268px landed on exactly
    // 100 — a drag easily made by accident. A flat rate cannot spike like
    // that; it only ever gives distance ÷ 12.
    expect(scrubPoints(268)).toBe(22);
    expect(scrubPoints(1000)).toBe(83);
  });

  it('is symmetric, so dragging back always undoes the gesture exactly', () => {
    for (const distance of [5, 17, 60, 61, 120, 160, 161, 240, 500]) {
      expect(scrubPoints(-distance)).toBe(-scrubPoints(distance));
    }
  });

  it('is monotonic — further is never fewer points', () => {
    let previous = 0;
    for (let distance = 0; distance <= 600; distance += 3) {
      const points = scrubPoints(distance);
      expect(points).toBeGreaterThanOrEqual(previous);
      previous = points;
    }
  });
});
