import type { Rng } from '$application/ports/rng';

export const systemRng: Rng = {
  next: () => Math.random()
};
