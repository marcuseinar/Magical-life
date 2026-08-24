<script lang="ts">
  import { COUNTER_KINDS } from '$domain/rules';
  import type { CounterKind } from '$domain/rules';
  import type { PlayerState } from '$domain/state';

  let {
    player,
    /** Matches the player's panel, so the sheet reads right way up from their seat. */
    rotated = false,
    onchange,
    onclose
  }: {
    player: PlayerState;
    rotated?: boolean;
    onchange: (counter: CounterKind, delta: number) => void;
    onclose: () => void;
  } = $props();

  const LABELS: Record<CounterKind, string> = {
    poison: 'Poison',
    energy: 'Energy',
    experience: 'Experience',
    rad: 'Rad',
    ticket: 'Ticket'
  };

  let closeButton = $state<HTMLButtonElement | null>(null);
  $effect(() => closeButton?.focus());
</script>

<!--
  Lives at the page level rather than inside the panel. A panel is small, and it
  clips its own overflow, so an editor rendered inside one spills off the card at
  four players and off the screen at six.
-->
<svelte:window
  onkeydown={(event) => {
    if (event.key === 'Escape') onclose();
  }}
/>

<div class="scrim">
  <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
  <div class="scrim__hit" onclick={onclose}></div>

  <div
    class="sheet"
    data-rotated={rotated}
    data-colour={player.colour}
    role="dialog"
    aria-modal="true"
    aria-label="Counters for {player.name}"
  >
    <header class="head">
      <h2 class="title">{player.name}</h2>
      <button class="close" bind:this={closeButton} onclick={onclose} aria-label="Close counters"
        >×</button
      >
    </header>

    <ul class="rows">
      {#each COUNTER_KINDS as kind (kind)}
        <li class="row" data-kind={kind}>
          <span class="row__label">{LABELS[kind]}</span>
          <button
            class="step"
            aria-label="Remove one {LABELS[kind].toLowerCase()} counter from {player.name}"
            disabled={player.counters[kind] === 0}
            onclick={() => onchange(kind, -1)}>−</button
          >
          <span class="row__value" aria-live="polite"
            >{player.counters[kind]}<span class="sr-only"> {LABELS[kind].toLowerCase()}</span></span
          >
          <button
            class="step"
            aria-label="Add one {LABELS[kind].toLowerCase()} counter to {player.name}"
            onclick={() => onchange(kind, 1)}>+</button
          >
        </li>
      {/each}
    </ul>
  </div>
</div>

<style>
  .scrim {
    position: fixed;
    z-index: 20;
    inset: 0;
    display: grid;
    place-items: center;
    padding: var(--space-4);
    background: var(--surface-scrim);
  }

  .scrim__hit {
    position: absolute;
    inset: 0;
  }

  .sheet {
    position: relative;
    display: grid;
    gap: var(--space-3);
    width: min(22rem, 100%);
    max-height: 100%;
    padding: var(--space-4);
    overflow-y: auto;
    border: 1px solid var(--frame-rule-strong);
    border-radius: var(--radius-lg);
    background: linear-gradient(175deg, var(--player-ink), var(--surface-panel) 85%);
    box-shadow: var(--shadow-float);

    /* The sheet scrolls even though the page cannot. */
    touch-action: pan-y;
  }

  .sheet[data-rotated='true'] {
    transform: rotate(180deg);
  }

  .head {
    display: flex;
    gap: var(--space-2);
    align-items: center;
    padding-bottom: var(--space-2);
    border-bottom: 1px solid var(--frame-rule);
  }

  .title {
    flex: 1;
    margin: 0;
    overflow: hidden;
    color: var(--text-gold);
    font-family: var(--font-display);
    font-size: 1.05rem;
    letter-spacing: var(--tracking-display);
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .close {
    display: grid;
    place-items: center;
    width: 2.2rem;
    height: 2.2rem;
    border: 1px solid var(--frame-rule);
    border-radius: var(--radius-pill);
    color: var(--text-muted);
    font-size: 1.1rem;
    line-height: 1;
  }

  .rows {
    display: grid;
    gap: var(--space-2);
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .row {
    display: grid;
    grid-template-columns: 1fr auto 3rem auto;
    gap: var(--space-2);
    align-items: center;
  }

  .row__label {
    color: var(--text-muted);
    font-size: 0.9rem;
    text-align: left;
  }

  .row__value {
    font-family: var(--font-numeric);
    font-size: 1.1rem;
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

    /* Comfortable touch target, even one-handed in a dim room. */
    min-width: 2.75rem;
    min-height: 2.75rem;
    border: 1px solid var(--frame-rule);
    border-radius: var(--radius-md);
    background: var(--surface-raised);
    font-size: 1.2rem;
    line-height: 1;
  }

  .step:disabled {
    opacity: 0.35;
    cursor: default;
  }
</style>
