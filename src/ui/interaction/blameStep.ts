/**
 * How far sideways the finger travels to move one place along the row of
 * candidate commanders.
 *
 * A fixed step cannot work. The row is as long as the table is big, but the
 * card it lives on gets *smaller* as players are added — at six seats a fixed
 * 44px step wanted 264px of travel inside a 248px card, so the last seats were
 * unreachable. The step is therefore sized against the room the finger actually
 * has, and only capped at a comfortable reach when there is room to spare.
 */

/** A comfortable reach for one place, used whenever the card can afford it. */
export const MAX_BLAME_STEP_PX = 44;

/**
 * `room` is the distance from the press point to the far edge of the card.
 *
 * There is deliberately no lower bound. A minimum step and a guarantee that
 * every candidate is reachable are the same trade made twice: any floor above
 * `room / gaps` puts the far end of the row out of reach again, which is the
 * bug this exists to fix. Steadiness loses. In practice it costs nothing — the
 * step is measured against the wider side of the press, so the room is never
 * less than half a card, and six seats on a 320px screen still leave 14px.
 */
export function blameStepPx(room: number, candidates: number): number {
  // One candidate is already selected at rest, so it is the gaps that must fit.
  const gaps = Math.max(1, candidates - 1);

  // Pressing exactly on the edge leaves nothing to travel in; fall back to a
  // real step rather than dividing by nothing and blaming the last seat.
  if (room <= 0) return MAX_BLAME_STEP_PX;

  return Math.min(MAX_BLAME_STEP_PX, room / gaps);
}

/**
 * Distance is measured without a sign: a loss is usually pressed on the minus
 * zone and dragged right, but a scrub down from the plus zone starts on the
 * other side of the card, and that gesture has to work too.
 */
export function blameIndex(sideways: number, stepPx: number, candidates: number): number {
  const step = Math.round(Math.abs(sideways) / stepPx);
  return Math.min(candidates - 1, Math.max(0, step));
}
