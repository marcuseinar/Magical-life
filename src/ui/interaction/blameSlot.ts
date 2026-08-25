/**
 * Which candidate the finger is over, as an index into the attribution row.
 *
 * The row is a fixed set of equal columns spanning the card, and the answer
 * comes from where the finger *is* — not from how far it has travelled since
 * the press. Measuring travel meant the same screen position selected different
 * players depending on where the drag began, which is impossible to aim: you
 * cannot see where you started, only where you are.
 */

/** Nothing is under the finger, so nobody is blamed. */
export const NO_SLOT = -1;

export function blameSlot(
  x: number,
  left: number,
  width: number,
  slots: number,
  rotated: boolean
): number {
  // Before the row is laid out there is nothing to be over. Blaming nobody is
  // the safe answer; blaming whoever is first would be a silent misattribution.
  if (width <= 0 || slots <= 0) return NO_SLOT;

  const along = rotated ? width - (x - left) : x - left;
  const slot = Math.floor((along / width) * slots);
  return Math.min(slots - 1, Math.max(0, slot));
}
