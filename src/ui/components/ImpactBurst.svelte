<script lang="ts">
  import { IMPACT_DURATION_MS } from '$ui/interaction/impactBurst';
  import type { ImpactDirection } from '$ui/interaction/impactBurst';
  import type { ImpactOrigin } from '$ui/interaction/impactBursts.svelte';

  let {
    direction,
    glyphs,
    scale,
    origin
  }: {
    direction: ImpactDirection;
    glyphs: number;
    scale: number;
    origin: ImpactOrigin;
  } = $props();

  /*
   * Deterministic scatter rather than `Math.random` — the golden angle
   * (in radians) spaces points around a circle with no two ever landing
   * close together, however many there are, and the same burst looks the
   * same in every screenshot and every test.
   */
  const GOLDEN_ANGLE = 2.399963;
  /** How wide the cloud spreads as it crosses the screen. */
  const SPREAD_VW = 42;
  /** How much the glyphs stagger near the origin before they spread out. */
  const JITTER_VH = 6;
  const MAX_DELAY_MS = 420;

  const symbol = $derived(direction === 'loss' ? '−' : '+');

  const marks = $derived(
    Array.from({ length: glyphs }, (_, index) => {
      const angle = index * GOLDEN_ANGLE;
      return {
        id: index,
        driftVw: Math.sin(angle) * SPREAD_VW,
        jitterVh: Math.cos(angle) * JITTER_VH,
        // A second, faster turn so the delay and the drift don't track each
        // other — two glyphs drifting the same way don't also fire together.
        delayMs: Math.round((Math.abs(Math.sin(angle * 3.1)) * MAX_DELAY_MS) / 20) * 20
      };
    })
  );
</script>

<!--
  Purely atmospheric feedback for a life change already shown by the number
  itself — hidden from assistive technology entirely, the same call as
  `Filigree` and `LoadingDots`.
-->
<div
  class="burst"
  data-direction={direction}
  style:left="{origin.x}px"
  style:top="{origin.y}px"
  style:--burst-scale={scale}
  style:--burst-duration="{IMPACT_DURATION_MS}ms"
  aria-hidden="true"
>
  {#each marks as mark (mark.id)}
    <span
      class="mark"
      style:animation-delay="{mark.delayMs}ms"
      style:--drift="{mark.driftVw}vw"
      style:--jitter="{mark.jitterVh}vh"
    >
      {symbol}
    </span>
  {/each}
</div>

<style>
  /* Anchored to the panel that triggered it, in viewport pixels — everything
     under it is `position: absolute`, so the cloud can travel the rest of
     the screen without being clipped by any one card. */
  .burst {
    position: absolute;
    pointer-events: none;
  }

  .mark {
    position: absolute;
    top: 0;
    left: 0;
    font-family: var(--font-numeric);
    font-size: calc(1.2rem * var(--burst-scale));
    font-weight: 900;
    line-height: 1;
    opacity: 0;
    transform: translate(-50%, -50%);
    animation-duration: var(--burst-duration);
    animation-timing-function: linear;
    animation-fill-mode: forwards;
  }

  .burst[data-direction='loss'] .mark {
    color: var(--loss);
    animation-name: fall;
  }

  .burst[data-direction='gain'] .mark {
    color: var(--gain);
    animation-name: rise;
  }

  /*
   * A short pop away from the origin — the "spray" — then gravity: it
   * accelerates the rest of the way to the bottom of the screen, however
   * far that is from wherever it started, because `100vh` overshoots any
   * origin on screen by definition.
   */
  @keyframes fall {
    0% {
      transform: translate(-50%, -50%) scale(calc(0.5 * var(--burst-scale)));
      opacity: 0;
    }

    8% {
      opacity: 1;
    }

    22% {
      transform: translate(calc(-50% + var(--drift) * 0.3), calc(-50% + var(--jitter)))
        scale(var(--burst-scale));
      animation-timing-function: cubic-bezier(0.55, 0, 1, 0.45);
    }

    100% {
      transform: translate(calc(-50% + var(--drift)), calc(-50% + var(--jitter) + 100vh))
        scale(var(--burst-scale));
      opacity: 0;
    }
  }

  /* The mirror of the fall: a pop, then a long, decelerating float clear off
     the top of the screen — floaty rather than shot upward. */
  @keyframes rise {
    0% {
      transform: translate(-50%, -50%) scale(calc(0.5 * var(--burst-scale)));
      opacity: 0;
    }

    8% {
      opacity: 1;
    }

    22% {
      transform: translate(calc(-50% + var(--drift) * 0.3), calc(-50% + var(--jitter)))
        scale(var(--burst-scale));
      animation-timing-function: cubic-bezier(0, 0.55, 0.45, 1);
    }

    100% {
      transform: translate(calc(-50% + var(--drift)), calc(-50% + var(--jitter) - 100vh))
        scale(var(--burst-scale));
      opacity: 0;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .mark {
      display: none;
    }
  }
</style>
