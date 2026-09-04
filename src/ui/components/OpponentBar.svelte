<script lang="ts">
  import { threatLevel } from '$domain/selectors';
  import type { PlayerState } from '$domain/state';
  import ManaPip from './ManaPip.svelte';

  let { players }: { players: readonly PlayerState[] } = $props();
</script>

<!--
  Everyone in this row is somebody else's device to play — see PlayerPanel's
  `readOnly`, which is the same rule. There is nothing here to lock, because
  there was never anything to tap: this is a reading, not a control.
-->
<div class="bar" role="group" aria-label="Opponents">
  {#each players as player (player.id)}
    <div class="chip" data-threat={threatLevel(player)} data-eliminated={player.eliminated}>
      <ManaPip colour={player.colour} size={18} />
      <span class="chip__name">{player.name}</span>
      <span class="chip__life" role="status" aria-label="{player.name}: {player.life} life">
        {player.life}
      </span>
    </div>
  {/each}
</div>

<style>
  /* Just tall enough to read a name and a number — the full card is what the
     opponent's own device is for. */
  .bar {
    display: flex;
    flex: none;
    gap: var(--space-2);
    padding: var(--space-2) var(--space-3);
    overflow-x: auto;
    scrollbar-width: none;
  }

  .bar::-webkit-scrollbar {
    display: none;
  }

  .chip {
    display: flex;
    flex: none;
    gap: var(--space-1);
    align-items: center;
    padding: var(--space-1) var(--space-2);
    border: 1px solid var(--frame-rule);
    border-radius: var(--radius-pill);
    background: var(--surface-sunken);
  }

  .chip[data-threat='warning'] {
    border-color: var(--accent);
  }

  .chip[data-threat='lethal'] {
    border-color: var(--danger);
  }

  .chip[data-eliminated='true'] {
    filter: grayscale(0.85);
    opacity: 0.55;
  }

  .chip__name {
    color: var(--text-muted);
    font-size: var(--size-chip);
    white-space: nowrap;
  }

  .chip__life {
    color: var(--text-primary);
    font-family: var(--font-numeric);
    font-size: var(--size-name);
    font-weight: 700;
    font-variant-numeric: tabular-nums;
  }

  .chip[data-threat='lethal'] .chip__life {
    color: var(--danger);
  }
</style>
