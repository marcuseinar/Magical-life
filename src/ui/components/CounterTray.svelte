<script lang="ts">
  import { COUNTER_KINDS } from '$domain/rules';
  import type { CounterKind } from '$domain/rules';

  let {
    playerName,
    counters,
    onopen
  }: {
    playerName: string;
    counters: Readonly<Record<CounterKind, number>>;
    onopen: () => void;
  } = $props();

  const LABELS: Record<CounterKind, string> = {
    poison: 'Poison',
    energy: 'Energy',
    experience: 'Experience',
    rad: 'Rad',
    ticket: 'Ticket'
  };

  /* Only what is actually on the board, so the tray is as long as it needs to be
     and never competes with the life total. */
  const shown = $derived(COUNTER_KINDS.filter((kind) => counters[kind] > 0));
</script>

<div class="tray">
  {#each shown as kind (kind)}
    <span class="chip" data-kind={kind}>
      <span class="chip__label">{LABELS[kind]}</span>
      <span class="chip__value">{counters[kind]}</span>
    </span>
  {/each}

  <button class="toggle" aria-label="Counters for {playerName}" onclick={onopen}>+</button>
</div>

<style>
  .tray {
    display: flex;
    gap: var(--space-1);
    align-items: center;

    /* The plate is narrow; chips scroll rather than pushing the panel apart. */
    overflow-x: auto;
    scrollbar-width: none;
  }

  .tray::-webkit-scrollbar {
    display: none;
  }

  .chip {
    display: inline-flex;
    gap: var(--space-1);
    align-items: baseline;
    padding: 2px var(--space-2);
    border: 1px solid var(--frame-rule);
    border-radius: var(--radius-pill);
    background: var(--surface-sunken);
    font-size: var(--size-chip);
    white-space: nowrap;
  }

  .chip__label {
    color: var(--text-muted);
    font-size: 0.75em;
    letter-spacing: 0.04em;
    text-transform: uppercase;
  }

  .chip__value {
    font-family: var(--font-numeric);
    font-weight: 700;
    font-variant-numeric: tabular-nums;
  }

  .chip[data-kind='poison'] {
    border-color: var(--poison);
    color: var(--poison);
  }

  .toggle {
    display: grid;
    flex: none;
    place-items: center;
    width: 1.9em;
    height: 1.9em;
    border: 1px solid var(--frame-rule);
    border-radius: var(--radius-pill);
    color: var(--text-muted);
    font-size: var(--size-chip);
    line-height: 1;
  }
</style>
