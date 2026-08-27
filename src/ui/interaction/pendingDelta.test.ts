import { describe, expect, it } from 'vitest';
import { COMMIT_WINDOW_MS, scrubPoints, stepDelta } from './pendingDelta';
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

  it('commits a deliberate gesture immediately on release', () => {
    const pending = stepDelta(idle, { kind: 'scrub', to: -12, now: at(0) });
    const out = stepDelta(pending.state, { kind: 'commit', now: at(10) });

    expect(out.commit).toBe(-12);
    expect(out.state).toBeNull();
  });

  it('committing nothing emits nothing', () => {
    expect(stepDelta(idle, { kind: 'commit', now: at(0) })).toEqual({ state: null, commit: null });
  });

  it('mixes tap and drag input in one pending value', () => {
    let out = stepDelta(idle, { kind: 'nudge', by: -3, now: at(0) });
    out = stepDelta(out.state, { kind: 'scrub', to: -20, now: at(50) });
    out = stepDelta(out.state, { kind: 'nudge', by: -1, now: at(100) });

    expect(out.state?.value).toBe(-21);
  });
});

describe('scrub sensitivity', () => {
  it('is one point per eight pixels close to the press point', () => {
    expect(scrubPoints(8)).toBe(1);
    expect(scrubPoints(32)).toBe(4);
  });

  it('is zero for a movement too small to mean anything', () => {
    expect(scrubPoints(0)).toBe(0);
    expect(scrubPoints(7)).toBe(0);
  });

  it('accelerates through the first two zones, so a moderate drag outpaces a small one', () => {
    expect(scrubPoints(160)).toBeGreaterThan(scrubPoints(80) * 2);
  });

  it('flattens out for a long drag, rather than running away', () => {
    // Reported from real use: 268px used to land on exactly 100 — a drag
    // easily made by accident, on a phone or with a mouse both. A screen's
    // whole height (~700px) must stay well short of that, and even a huge
    // drag (1000px, longer than any phone is tall) must not blow past it.
    expect(scrubPoints(268)).toBeLessThan(50);
    expect(scrubPoints(700)).toBeLessThan(70);
    expect(scrubPoints(1000)).toBeLessThan(100);
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
