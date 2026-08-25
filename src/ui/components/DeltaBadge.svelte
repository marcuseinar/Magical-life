<script lang="ts">
  let {
    value,
    progress,
    label,
    oncancel
  }: {
    value: number;
    /** 1 → 0 as the commit window drains. */
    progress: number;
    label: string;
    oncancel: () => void;
  } = $props();

  const CIRCUMFERENCE = 2 * Math.PI * 30;

  const signed = $derived(value > 0 ? `+${value}` : `${value}`);
</script>

<!--
  The pending change, floating over the total like combat damage.
  It is a button, because tapping it to cancel is the fastest undo in the app
  and it costs no extra chrome.
-->
<button
  class="badge"
  data-direction={value > 0 ? 'gain' : 'loss'}
  onclick={oncancel}
  aria-label="{label}, cancel pending change of {signed}"
>
  <svg class="ring" viewBox="0 0 68 68" aria-hidden="true" focusable="false">
    <circle class="ring__track" cx="34" cy="34" r="30" />
    <circle
      class="ring__drain"
      cx="34"
      cy="34"
      r="30"
      stroke-dasharray="{CIRCUMFERENCE} {CIRCUMFERENCE}"
      stroke-dashoffset={CIRCUMFERENCE * (1 - progress)}
    />
  </svg>
  <span class="value" aria-hidden="true">{signed}</span>
</button>

<style>
  .badge {
    position: relative;
    display: grid;
    place-items: center;
    padding: 0;
    border-radius: var(--radius-pill);
    aspect-ratio: 1;
    width: clamp(3.25rem, 17cqmin, 7rem);
    background: radial-gradient(circle at 50% 35%, var(--surface-raised), var(--surface-sunken));
    /* Callers that want the rim to say something — whose commander is being
       blamed, say — set these; everybody else gets the ordinary hairline. A
       custom property crosses the component boundary where a selector cannot. */
    box-shadow:
      inset 0 0 0 var(--badge-rim-width, 1px) var(--badge-rim, var(--frame-rule)),
      var(--shadow-float);
    animation: land var(--duration-base) var(--ease-out);
  }

  .ring {
    position: absolute;
    inset: 0;
    fill: none;
    transform: rotate(-90deg);
  }

  .ring__track {
    stroke: var(--frame-rule);
    stroke-width: 2;
    opacity: 0.4;
  }

  .ring__drain {
    stroke: currentcolor;
    stroke-width: 3;
    stroke-linecap: round;
    transition: stroke-dashoffset var(--duration-fast) linear;
  }

  .value {
    font-family: var(--font-numeric);
    font-size: var(--size-delta);
    font-weight: 700;
    font-variant-numeric: tabular-nums;
    line-height: 1;
    color: currentcolor;
  }

  .badge[data-direction='loss'] {
    color: var(--loss);
  }

  .badge[data-direction='gain'] {
    color: var(--gain);
  }

  @keyframes land {
    from {
      transform: scale(0.7);
      opacity: 0;
    }

    to {
      transform: scale(1);
      opacity: 1;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .badge {
      animation: none;
    }
  }
</style>
