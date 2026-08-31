<script lang="ts">
  import type { ThreatLevel } from '$domain/selectors';

  let {
    life,
    threat = 'safe',
    label,
    interim = false
  }: {
    life: number;
    threat?: ThreatLevel;
    label: string;
    /** The total includes a change still being made, so it is about to move again. */
    interim?: boolean;
  } = $props();
</script>

<!--
  The running total, including whatever is pending: a life counter that shows
  yesterday's number until a timer expires is lying to the table.

  `role="status"` is an implicit polite live region, and unlike a bare
  paragraph it is allowed to carry an accessible name. While a change is
  still being made, `aria-live="off"` silences it — otherwise a screen reader
  would read out every value a scrub passes through on the way. Announcing
  resumes for the settled result, which is the one worth hearing.
-->
<p
  class="total"
  data-threat={threat}
  role="status"
  aria-live={interim ? 'off' : 'polite'}
  aria-label="{label}: {life} life"
>
  <span aria-hidden="true">{life}</span>
</p>

<style>
  .total {
    margin: 0;
    color: var(--text-primary);
    font-family: var(--font-numeric);
    font-size: var(--size-total);
    font-weight: 700;
    font-variant-numeric: tabular-nums;
    line-height: 0.95;

    /* Embossed into the card rather than printed on top of it. */
    text-shadow:
      0 1px 0 var(--frame-highlight),
      0 2px 14px var(--frame-shadow);
    transition: color var(--duration-base) var(--ease-out);
  }

  .total[data-threat='warning'] {
    color: var(--accent);
  }

  .total[data-threat='lethal'] {
    color: var(--danger);
    animation: flicker 2.4s ease-in-out infinite;
  }

  @keyframes flicker {
    0%,
    100% {
      opacity: 1;
    }

    50% {
      opacity: 0.72;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .total[data-threat='lethal'] {
      animation: none;
    }
  }
</style>
