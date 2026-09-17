import { IMPACT_DURATION_MS, impactSpec } from './impactBurst';
import type { ImpactSpec } from './impactBurst';

/**
 * Drives `impactSpec` with a real timer and the motion preference.
 *
 * The spec stays pure and exhaustively tested; everything impure — the id
 * each burst needs to be removed again, the timer that removes it, and
 * reading `prefers-reduced-motion` — is confined to here. Mirrors
 * `deltaController` and `spinController`.
 */

/** Where on screen a burst starts — the tapped panel's own position, in
 *  viewport pixels, so the cloud can travel the rest of the screen from
 *  there regardless of which panel it came from. */
export type ImpactOrigin = { readonly x: number; readonly y: number };

export type ImpactBurst = ImpactSpec & { readonly id: number; readonly origin: ImpactOrigin };

export type ImpactBursts = {
  /** Every burst still animating, oldest first. Each tap or slide release
   *  adds one on top of whatever is already here — nothing replaces
   *  anything already playing. */
  readonly items: readonly ImpactBurst[];
  /** `delta` is the size and direction of the change this burst is for;
   *  `origin` is where it starts. A zero delta, or reduced motion, spawns
   *  nothing. */
  spawn(delta: number, origin: ImpactOrigin): void;
  destroy(): void;
};

const prefersReducedMotion = () =>
  typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

export function createImpactBursts(): ImpactBursts {
  let items = $state<ImpactBurst[]>([]);
  let nextId = 0;
  let timers: ReturnType<typeof setTimeout>[] = [];

  const remove = (id: number) => {
    items = items.filter((item) => item.id !== id);
  };

  return {
    get items() {
      return items;
    },
    spawn(delta, origin) {
      if (delta === 0 || prefersReducedMotion()) return;

      nextId += 1;
      const id = nextId;
      items = [...items, { ...impactSpec(delta), id, origin }];

      const timer = setTimeout(() => {
        timers = timers.filter((pending) => pending !== timer);
        remove(id);
      }, IMPACT_DURATION_MS);
      timers = [...timers, timer];
    },
    destroy() {
      for (const timer of timers) clearTimeout(timer);
      timers = [];
    }
  };
}
