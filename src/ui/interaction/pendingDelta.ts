/**
 * One state machine, several input styles.
 *
 * Tapping a zone and dragging a scrubber both feed the same accumulator, so the
 * log records "Anna −7" rather than seven separate "−1"s, and adding a third
 * input method later (hardware buttons, a watch, voice) is a new caller rather
 * than a change in here.
 *
 * Pure and synchronous: `now` is passed in and timers live in the component.
 */

/** How long a pending change waits before it becomes an event. */
export const COMMIT_WINDOW_MS = 4000;

export type DeltaState = {
  readonly value: number;
  readonly deadline: number;
} | null;

export type DeltaInput =
  /** A tap: move the pending value by `by`. */
  | { readonly kind: 'nudge'; readonly by: number; readonly now: number }
  /** A drag: set the pending value outright, because the finger is the value. */
  | { readonly kind: 'scrub'; readonly to: number; readonly now: number }
  /** Deliberate release, or an explicit "apply". */
  | { readonly kind: 'commit'; readonly now: number }
  /** Tapping the badge, or dragging out of bounds. */
  | { readonly kind: 'cancel' }
  /** The clock, asking whether the window has run out. */
  | { readonly kind: 'tick'; readonly now: number };

export type DeltaOutcome = {
  readonly state: DeltaState;
  /** Non-null exactly when a life change should be recorded. */
  readonly commit: number | null;
};

const nothing: DeltaOutcome = { state: null, commit: null };

const pending = (value: number, now: number): DeltaOutcome =>
  // A pending value of zero is not pending at all — it is idle.
  value === 0 ? nothing : { state: { value, deadline: now + COMMIT_WINDOW_MS }, commit: null };

export function stepDelta(state: DeltaState, input: DeltaInput): DeltaOutcome {
  switch (input.kind) {
    case 'nudge':
      return pending((state?.value ?? 0) + input.by, input.now);

    case 'scrub':
      return pending(input.to, input.now);

    case 'commit':
      return state === null ? nothing : { state: null, commit: state.value };

    case 'cancel':
      return nothing;

    case 'tick':
      if (state === null || input.now < state.deadline) return { state, commit: null };
      return { state: null, commit: state.value };
  }
}

/** How far the finger has to travel for one more point, by zone. */
const ZONES: readonly { readonly until: number; readonly pixelsPerPoint: number }[] = [
  { until: 60, pixelsPerPoint: 8 },
  { until: 160, pixelsPerPoint: 4 },
  { until: Infinity, pixelsPerPoint: 1.6 }
];

/**
 * Scrub distance to points.
 *
 * Deliberately a function of distance from the press point and *not* of
 * velocity: dragging back to the same pixel must always give the same number.
 * Velocity-scaled scrubbing cannot be undone by reversing the gesture, which
 * feels broken in the hand however good it looks in a demo.
 */
export function scrubPoints(pixels: number): number {
  const distance = Math.abs(pixels);

  let points = 0;
  let covered = 0;
  for (const zone of ZONES) {
    const inZone = Math.min(distance, zone.until) - covered;
    if (inZone <= 0) break;
    points += inZone / zone.pixelsPerPoint;
    covered += inZone;
  }

  return Math.sign(pixels) * Math.floor(points);
}
