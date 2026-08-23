<!--
  Corner scrollwork. Purely atmospheric — it is the difference between a card
  and a rectangle — so it is hidden from assistive technology entirely.
-->
<div class="filigree" aria-hidden="true">
  {#each ['tl', 'tr', 'bl', 'br'] as corner (corner)}
    <svg class="corner corner--{corner}" viewBox="0 0 28 28" focusable="false">
      <path d="M1 27C1 12 12 1 27 1" />
      <path d="M1 19C1 9 9 1 19 1" />
      <circle cx="7" cy="7" r="2" />
    </svg>
  {/each}
</div>

<style>
  .filigree {
    position: absolute;
    inset: 0;
    pointer-events: none;
  }

  .corner {
    position: absolute;
    width: clamp(18px, 7cqmin, 34px);
    height: clamp(18px, 7cqmin, 34px);
    fill: none;
    stroke: var(--frame-rule);
    stroke-width: 1.1;
    opacity: 0.85;
  }

  .corner circle {
    fill: var(--frame-rule);
    stroke: none;
  }

  .corner--tl {
    top: var(--space-2);
    left: var(--space-2);
  }

  .corner--tr {
    top: var(--space-2);
    right: var(--space-2);
    transform: scaleX(-1);
  }

  .corner--bl {
    bottom: var(--space-2);
    left: var(--space-2);
    transform: scaleY(-1);
  }

  .corner--br {
    right: var(--space-2);
    bottom: var(--space-2);
    transform: scale(-1);
  }
</style>
