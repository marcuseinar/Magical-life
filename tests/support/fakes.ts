import type { Clock } from '$application/ports/clock';
import type { IdSource } from '$application/ports/idSource';

/** Time is a dependency, so tests own it. */
export function fakeClock(start = 1_700_000_000_000): Clock & { advance(ms: number): void } {
  let now = start;
  return {
    now: () => now,
    advance: (ms) => {
      now += ms;
    }
  };
}

export function countingIdSource(prefix = 'p'): IdSource {
  let next = 0;
  return { next: () => `${prefix}${next++}` };
}
