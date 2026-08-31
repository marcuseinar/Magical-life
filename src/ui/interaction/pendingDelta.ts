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

/** How long a pending change stays on screen, and waits, before it becomes an event. */
export const COMMIT_WINDOW_MS = 3000;

/**
 * How long a *released* scrub stays live before committing.
 *
 * Short, because the finger has already said it is done — but not zero. Two
 * drags in quick succession are one correction made in two movements far
 * more often than they are two separate decisions, and committing the
 * instant a drag ended made that into two log entries needing two undos.
 * Anything inside this window joins the gesture already in progress.
 */
export const CONTINUE_WINDOW_MS = 800;

export type DeltaState = {
  readonly value: number;
  readonly deadline: number;
  /** Which window this deadline came from, so the drain ring is drawn to scale. */
  readonly window: number;
} | null;

export type DeltaInput =
  /** A tap: move the pending value by `by`. */
  | { readonly kind: 'nudge'; readonly by: number; readonly now: number }
  /** A drag: set the pending value outright, because the finger is the value. */
  | { readonly kind: 'scrub'; readonly to: number; readonly now: number }
  /** The finger lifting off a drag. Does not commit — see CONTINUE_WINDOW_MS. */
  | { readonly kind: 'release'; readonly now: number }
  /**
   * Commit right now, whatever the window says. For the moments when the
   * screen is about to disagree with the log: the tab going away, an undo, a
   * rematch. The total already counts a pending change, so anything that
   * reads or resets the committed history has to see it too.
   */
  | { readonly kind: 'flush' }
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

const pending = (value: number, now: number, window = COMMIT_WINDOW_MS): DeltaOutcome =>
  // A pending value of zero is not pending at all — it is idle.
  value === 0 ? nothing : { state: { value, deadline: now + window, window }, commit: null };

export function stepDelta(state: DeltaState, input: DeltaInput): DeltaOutcome {
  switch (input.kind) {
    case 'nudge':
      return pending((state?.value ?? 0) + input.by, input.now);

    case 'scrub':
      return pending(input.to, input.now);

    case 'release':
      // Deliberately not a commit. The value stays live on the short window,
      // so a drag begun straight after continues this one; the tick below
      // commits it if nothing does.
      return state === null ? nothing : pending(state.value, input.now, CONTINUE_WINDOW_MS);

    case 'flush':
      return state === null ? nothing : { state: null, commit: state.value };

    case 'cancel':
      return nothing;

    case 'tick':
      if (state === null || input.now < state.deadline) return { state, commit: null };
      return { state: null, commit: state.value };
  }
}

/**
 * How far the finger travels for one point — the same everywhere in the
 * gesture.
 *
 * This used to be a zoned curve that tightened as the drag went on, which
 * made the same movement worth different amounts depending on when in the
 * gesture it happened: impossible to aim, and impossible to draw honestly.
 * The panel now rules the scrub with a line per point, and evenly spaced
 * lines are only true if every point is the same distance away from the
 * last. Also the reason a runaway is no longer possible — a flat rate can
 * only ever give distance ÷ 8.
 */
export const PIXELS_PER_POINT = 8;

/**
 * Scrub distance to points.
 *
 * Deliberately a function of distance from the press point and *not* of
 * velocity: dragging back to the same pixel must always give the same number.
 * Velocity-scaled scrubbing cannot be undone by reversing the gesture, which
 * feels broken in the hand however good it looks in a demo.
 */
export function scrubPoints(pixels: number): number {
  return Math.sign(pixels) * Math.floor(Math.abs(pixels) / PIXELS_PER_POINT);
}
