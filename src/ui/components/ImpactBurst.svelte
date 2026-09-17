<script lang="ts">
  import { IMPACT_DURATION_MS, MAX_GLYPHS } from '$ui/interaction/impactBurst';
  import type { ImpactDirection } from '$ui/interaction/impactBurst';

  let {
    direction,
    glyphs,
    scale
  }: {
    direction: ImpactDirection;
    glyphs: number;
    scale: number;
  } = $props();

  /*
   * A fixed spread of horizontal offsets rather than `Math.random` — the
   * spray still reads as scattered, and the same burst looks the same in
   * every screenshot and every test.
   */
  const OFFSETS_PCT = [-36, -20, -6, 8, 22, 36] as const;
  const DELAY_STEP_MS = 60;

  const symbol = $derived(direction === 'loss' ? '−' : '+');

  const marks = $derived(
    Array.from({ length: Math.min(glyphs, MAX_GLYPHS) }, (_, index) => ({
      id: index,
      offset: OFFSETS_PCT[index % OFFSETS_PCT.length]!,
      delayMs: index * DELAY_STEP_MS
    }))
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
  style:--burst-scale={scale}
  style:--burst-duration="{IMPACT_DURATION_MS}ms"
  aria-hidden="true"
>
  {#each marks as mark (mark.id)}
    <span
      class="mark"
      style:left="calc(50% + {mark.offset}%)"
      style:animation-delay="{mark.delayMs}ms"
    >
      {symbol}
    </span>
  {/each}
</div>

<style>
  .burst {
    position: absolute;
    inset: 0;
    overflow: hidden;
    pointer-events: none;
  }

  .mark {
    position: absolute;
    top: 50%;
    font-family: var(--font-numeric);
    font-size: calc(1.4rem * var(--burst-scale));
    font-weight: 900;
    line-height: 1;
    opacity: 0;
    transform: translate(-50%, -50%);
    animation-duration: var(--burst-duration);
    animation-timing-function: var(--ease-out);
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

  /* Falls in from where it landed, drifting a little wider as it goes, and
     is gone before it reaches the footer plate. */
  @keyframes fall {
    0% {
      transform: translate(-50%, -60%) scale(calc(0.6 * var(--burst-scale)));
      opacity: 0;
    }

    15% {
      opacity: 1;
    }

    100% {
      transform: translate(calc(-50% + 8px), calc(-50% + 34cqmin * var(--burst-scale)))
        scale(var(--burst-scale));
      opacity: 0;
    }
  }

  /* Floats up and out, the mirror of the blood falling. */
  @keyframes rise {
    0% {
      transform: translate(-50%, -40%) scale(calc(0.6 * var(--burst-scale)));
      opacity: 0;
    }

    15% {
      opacity: 1;
    }

    100% {
      transform: translate(calc(-50% - 8px), calc(-50% - 34cqmin * var(--burst-scale)))
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
