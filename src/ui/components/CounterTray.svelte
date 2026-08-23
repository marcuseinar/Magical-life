<script lang="ts">
  import { COUNTER_KINDS } from '$domain/rules';
  import type { CounterKind } from '$domain/rules';

  let {
    playerName,
    counters,
    onchange
  }: {
    playerName: string;
    counters: Readonly<Record<CounterKind, number>>;
    onchange: (counter: CounterKind, delta: number) => void;
  } = $props();

  const LABELS: Record<CounterKind, string> = {
    poison: 'Poison',
    energy: 'Energy',
    experience: 'Experience',
    rad: 'Rad',
    ticket: 'Ticket'
  };

  let open = $state(false);

  /* Only what is actually on the board, so the tray is as long as it needs to be
     and never competes with the life total. Poison leads when present. */
  const shown = $derived(COUNTER_KINDS.filter((kind) => counters[kind] > 0));
</script>

<div class="tray">
  {#each shown as kind (kind)}
    <span class="chip" data-kind={kind}>
      <span class="chip__label">{LABELS[kind]}</span>
      <span class="chip__value">{counters[kind]}</span>
    </span>
  {/each}

  <button
    class="toggle"
    aria-expanded={open}
    aria-label="{open ? 'Hide' : 'Show'} counters for {playerName}"
    onclick={() => (open = !open)}
  >
    {open ? '×' : '+'}
  </button>
</div>

{#if open}
  <ul class="editor" aria-label="Counters for {playerName}">
    {#each COUNTER_KINDS as kind (kind)}
      <li class="row" data-kind={kind}>
        <span class="row__label">{LABELS[kind]}</span>
        <button
          class="step"
          aria-label="Remove one {LABELS[kind].toLowerCase()} counter from {playerName}"
          disabled={counters[kind] === 0}
          onclick={() => onchange(kind, -1)}>−</button
        >
        <span class="row__value" aria-live="polite"
          >{counters[kind]}<span class="sr-only"> {LABELS[kind].toLowerCase()}</span></span
        >
        <button
          class="step"
          aria-label="Add one {LABELS[kind].toLowerCase()} counter to {playerName}"
          onclick={() => onchange(kind, 1)}>+</button
        >
      </li>
    {/each}
  </ul>
{/if}

<style>
  .tray {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-1);
    align-items: center;
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
    letter-spacing: 0.04em;
    text-transform: uppercase;
    font-size: 0.75em;
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
    place-items: center;
    width: 1.9em;
    height: 1.9em;
    border: 1px solid var(--frame-rule);
    border-radius: var(--radius-pill);
    color: var(--text-muted);
    font-size: var(--size-chip);
    line-height: 1;
  }

  .editor {
    display: grid;
    gap: var(--space-1);
    margin: var(--space-2) 0 0;
    padding: var(--space-2);
    border: 1px solid var(--frame-rule);
    border-radius: var(--radius-md);
    background: var(--surface-sunken);
    list-style: none;
  }

  .row {
    display: grid;
    grid-template-columns: 1fr auto 2.5em auto;
    gap: var(--space-2);
    align-items: center;
    font-size: var(--size-chip);
  }

  .row__label {
    color: var(--text-muted);
    text-align: left;
  }

  .row__value {
    font-family: var(--font-numeric);
    font-weight: 700;
    font-variant-numeric: tabular-nums;
    text-align: center;
  }

  .row[data-kind='poison'] .row__value {
    color: var(--poison);
  }

  .step {
    display: grid;
    place-items: center;

    /* Never below the 44px comfortable-touch floor, even in a dense tray. */
    min-width: 2.4em;
    min-height: 2.4em;
    border: 1px solid var(--frame-rule);
    border-radius: var(--radius-sm);
    background: var(--surface-raised);
    line-height: 1;
  }

  .step:disabled {
    opacity: 0.35;
    cursor: default;
  }
</style>
