/**
 * The spotlight that travels round the table before settling on whoever is
 * going first.
 *
 * The winner is decided by the use case *before* any of this runs and is already
 * in the event log; this only decides how the answer is revealed. Keeping the
 * two apart is what stops the drama from being able to change the result.
 *
 * Pure: no timers, no randomness. The controller supplies the clock.
 */

/** How long the whole reveal takes. Long enough to be a moment, short enough to
 *  sit through before every game. */
export const SPIN_MS = 2800;

/**
 * Floor on a single highlight.
 *
 * The first version had no floor: it spread a fixed total across however many
 * steps the seat count produced, which at six seats made the opening steps
 * 1–40ms. Several were shorter than a frame, so the fast phase was not fast —
 * it was invisible, and the reveal read as a blur followed by a crawl.
 */
export const MIN_STEP_MS = 60;

/** How long the winner's panel blinks once the spotlight has stopped on them.
 *  Three blinks; the CSS keyframes must divide this evenly. */
export const WINNER_BLINK_MS = 900;

/** Roughly how many highlights to aim for, whatever the seat count, so a
 *  two-player game gets as much of a spin as a six-player one. */
const TARGET_STEPS = 16;

/** Opening highlights held at a flat, quick tempo before any slowing begins.
 *  This is the "alternating fast" half; the ramp is everything after it. */
const FLURRY_STEPS = 10;

/** Higher means a sharper slow-down at the end. */
const DECELERATION = 2.6;

export type SpinStep = {
  /** Seat to highlight. */
  readonly index: number;
  /** How long to hold it before moving on. */
  readonly delayMs: number;
};

export type SpinOptions = {
  readonly reducedMotion?: boolean;
};

/**
 * A schedule of highlights ending on `chosenIndex`.
 *
 * Two phases, because that is what the eye reads as a spin:
 *
 *   1. a flurry of even, quick flicks at `MIN_STEP_MS`
 *   2. a ramp that slows steeply into a long pause on the winner
 *
 * A single smooth curve does not do this. Spread over twenty-odd steps it
 * flattens into a uniform drift, and spread over few enough steps to have a real
 * tail it makes the opening frames too short to see. Separating the phases lets
 * both halves be right.
 *
 * The total stays fixed either way, so the length of the spin never hints at who
 * won.
 */
export function firstPlayerSpin(
  count: number,
  chosenIndex: number,
  { reducedMotion = false }: SpinOptions = {}
): SpinStep[] {
  const seats = Math.max(1, Math.floor(count));
  const target = Math.min(Math.max(0, Math.floor(chosenIndex)), seats - 1);

  // Nothing to travel between, and nobody who wants motion should be made to sit
  // through it.
  if (seats === 1 || reducedMotion) return [{ index: target, delayMs: 0 }];

  // Enough passes that the opening flurry is actually visible at any seat count.
  const cycles = Math.max(2, Math.ceil((TARGET_STEPS - target - 1) / seats));

  // Land on the target by construction: step k highlights seat k % seats, and
  // the count is chosen so that the final step comes out at the target.
  const steps = cycles * seats + target + 1;

  const flurry = Math.min(FLURRY_STEPS, steps - 1);
  const ramp = steps - flurry;

  // What the ramp has to play with once the flurry and the ramp's own floor are
  // paid for. Guarded so an unexpectedly long schedule degrades to an even spin
  // rather than to negative delays.
  const budget = SPIN_MS - flurry * MIN_STEP_MS;
  const discretionary = Math.max(0, budget - ramp * MIN_STEP_MS);
  if (discretionary === 0) {
    return Array.from({ length: steps }, (_, k) => ({
      index: k % seats,
      delayMs: SPIN_MS / steps
    }));
  }

  const weights = Array.from({ length: ramp }, (_, j) => (j + 1) ** DECELERATION);
  const totalWeight = weights.reduce((sum, weight) => sum + weight, 0);

  return Array.from({ length: steps }, (_, k) => ({
    index: k % seats,
    delayMs:
      k < flurry ? MIN_STEP_MS : MIN_STEP_MS + (discretionary * weights[k - flurry]!) / totalWeight
  }));
}
