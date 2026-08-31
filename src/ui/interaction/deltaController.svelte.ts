import { stepDelta } from './pendingDelta';
import type { DeltaInput, DeltaState } from './pendingDelta';

/** How often the drain ring is repainted. Fine for a three-second sweep, cheap enough to ignore. */
const TICK_MS = 80;

export type DeltaController = {
  /** The value currently waiting to be committed; zero when idle. */
  readonly pending: number;
  /** 1 → 0 as the commit window drains, for the ring around the badge. */
  readonly progress: number;
  nudge(by: number): void;
  scrub(to: number): void;
  release(): void;
  /** Commit now rather than waiting out the window. See `pendingFlush`. */
  flush(): void;
  cancel(): void;
  destroy(): void;
};

/**
 * Drives `stepDelta` with a real clock and a timer.
 *
 * The machine stays pure and exhaustively tested; everything impure — wall
 * time, the interval, the commit callback — is confined to this wrapper.
 */
export function createDeltaController(commit: (delta: number) => void): DeltaController {
  let state = $state<DeltaState>(null);
  let remaining = $state(0);
  let timer: ReturnType<typeof setInterval> | undefined;

  const stop = () => {
    clearInterval(timer);
    timer = undefined;
  };

  const apply = (input: DeltaInput) => {
    const outcome = stepDelta(state, input);
    state = outcome.state;

    if (state === null) {
      stop();
      remaining = 0;
    } else {
      remaining = Math.max(0, state.deadline - Date.now());
      timer ??= setInterval(() => apply({ kind: 'tick', now: Date.now() }), TICK_MS);
    }

    if (outcome.commit !== null) commit(outcome.commit);
  };

  return {
    get pending() {
      return state?.value ?? 0;
    },
    get progress() {
      // Against the window actually running, not always the long one: a
      // released scrub drains the short one, and its ring still starts full.
      return state === null ? 0 : remaining / state.window;
    },
    nudge: (by) => apply({ kind: 'nudge', by, now: Date.now() }),
    scrub: (to) => apply({ kind: 'scrub', to, now: Date.now() }),
    release: () => apply({ kind: 'release', now: Date.now() }),
    flush: () => apply({ kind: 'flush' }),
    cancel: () => apply({ kind: 'cancel' }),
    destroy: stop
  };
}
