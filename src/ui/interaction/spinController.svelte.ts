import { firstPlayerSpin } from './firstPlayerSpin';

/**
 * Drives `firstPlayerSpin` with a real clock.
 *
 * The schedule stays pure and exhaustively tested; wall time, the timer and the
 * motion preference are confined to here.
 */
export type SpinController = {
  /** Seat currently under the spotlight, or null when nothing is spinning. */
  readonly spotlight: number | null;
  readonly spinning: boolean;
  /** Resolves once the winner has had their moment. */
  run(count: number, chosenIndex: number): Promise<void>;
  stop(): void;
};

const prefersReducedMotion = () =>
  typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

export function createSpinController(): SpinController {
  let spotlight = $state<number | null>(null);
  let spinning = $state(false);
  let timer: ReturnType<typeof setTimeout> | undefined;

  const stop = () => {
    clearTimeout(timer);
    timer = undefined;
    spinning = false;
    spotlight = null;
  };

  return {
    get spotlight() {
      return spotlight;
    },
    get spinning() {
      return spinning;
    },
    stop,

    run(count, chosenIndex) {
      clearTimeout(timer);
      const steps = firstPlayerSpin(count, chosenIndex, {
        reducedMotion: prefersReducedMotion()
      });
      spinning = true;

      return new Promise((resolve) => {
        let next = 0;
        const advance = () => {
          const step = steps[next];
          if (step === undefined) {
            spinning = false;
            spotlight = null;
            resolve();
            return;
          }
          spotlight = step.index;
          next += 1;
          // The final delay is the pause on the winner, so it is waited out too.
          timer = setTimeout(advance, step.delayMs);
        };
        advance();
      });
    }
  };
}
