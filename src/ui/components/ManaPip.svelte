<script lang="ts">
  import type { ManaColour } from '$domain/rules';

  let { colour, size = 22 }: { colour: ManaColour; size?: number } = $props();
</script>

<!-- Decorative: the name plate beside it already carries the meaning. -->
<svg
  class="pip"
  data-colour={colour}
  width={size}
  height={size}
  viewBox="0 0 24 24"
  aria-hidden="true"
  focusable="false"
>
  <circle class="disc" cx="12" cy="12" r="11" />
  <g class="glyph">
    {#if colour === 'white'}
      <circle cx="12" cy="12" r="4.6" />
      <path
        d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.2 5.2l2.1 2.1M16.7 16.7l2.1 2.1M18.8 5.2l-2.1 2.1M7.3 16.7l-2.1 2.1"
        stroke-width="1.8"
        stroke-linecap="round"
        fill="none"
      />
    {:else if colour === 'blue'}
      <path d="M12 3.2c-3.4 4.6-6 7.4-6 10.2a6 6 0 0 0 12 0c0-2.8-2.6-5.6-6-10.2Z" />
    {:else if colour === 'black'}
      <path
        d="M12 3.5A7.4 7.4 0 0 0 4.6 11c0 2.5 1.2 4.4 2.9 5.5v2a1 1 0 0 0 1 1h7a1 1 0 0 0 1-1v-2c1.7-1.1 2.9-3 2.9-5.5A7.4 7.4 0 0 0 12 3.5Z"
      />
      <circle class="cut" cx="9.3" cy="10.8" r="1.9" />
      <circle class="cut" cx="14.7" cy="10.8" r="1.9" />
      <rect class="cut" x="11.1" y="14.2" width="1.8" height="2.6" rx="0.8" />
    {:else if colour === 'red'}
      <path
        d="M13.3 2.6c.6 3.6 4.4 5.3 4.4 9.4a5.7 5.7 0 0 1-11.4 0c0-1.9.9-3.2 2-4.3-.1 1.9.8 2.9 1.7 3-1.1-3.1.4-6.1 3.3-8.1Z"
      />
    {:else if colour === 'green'}
      <path d="M20 4C10.6 4 5 9.6 5 19c0 .6.4 1 1 1 9.4 0 15-5.6 15-15 0-.6-.4-1-1-1Z" />
      <path class="cut" d="M18 7C13 9 9.5 12.5 7.5 17.5" stroke-width="1.4" fill="none" />
    {:else if colour === 'multicolour'}
      <path d="m12 3 2.6 5.6 6.1.8-4.5 4.2 1.2 6-5.4-3-5.4 3 1.2-6L3.3 9.4l6.1-.8Z" />
    {:else}
      <path d="m12 3 9 9-9 9-9-9Z" />
    {/if}
  </g>
</svg>

<style>
  .pip {
    display: block;
    flex: none;
    filter: drop-shadow(0 1px 1px var(--frame-shadow));
  }

  .disc {
    fill: var(--player-glow);
    stroke: var(--frame-edge);
    stroke-width: 1;
  }

  .glyph {
    fill: var(--player-ink);
    stroke: var(--player-ink);
    stroke-width: 0;
  }

  .glyph path[fill='none'] {
    stroke: var(--player-ink);
  }

  .cut {
    fill: var(--player-glow);
    stroke: var(--player-glow);
  }
</style>
