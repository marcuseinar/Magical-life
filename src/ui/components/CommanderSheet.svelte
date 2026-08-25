<script lang="ts">
  import type { PlayerId } from '$domain/ids';
  import { LETHAL_COMMANDER_DAMAGE } from '$domain/rules';
  import { commanderDamageFrom } from '$domain/selectors';
  import type { PlayerState } from '$domain/state';
  import ManaPip from './ManaPip.svelte';

  let {
    player,
    opponents,
    rotated = false,
    onchange,
    onclose
  }: {
    player: PlayerState;
    /** Everyone whose commander could have hit this player — including them,
     *  since a stolen commander still deals its owner's damage. */
    opponents: readonly PlayerState[];
    rotated?: boolean;
    onchange: (from: PlayerId, delta: number) => void;
    onclose: () => void;
  } = $props();

  let closeButton = $state<HTMLButtonElement | null>(null);
  $effect(() => closeButton?.focus());

  /* Worst first: the commander about to kill you is the one you are looking for. */
  const rows = $derived(
    [...opponents]
      .map((opponent) => ({ opponent, total: commanderDamageFrom(player, opponent.id) }))
      .sort((a, b) => b.total - a.total || (a.opponent.name < b.opponent.name ? -1 : 1))
  );
</script>

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
    aria-label="Commander damage to {player.name}"
  >
    <header class="head">
      <h2 class="title">Commander damage to {player.name}</h2>
      <button
        class="close"
        bind:this={closeButton}
        onclick={onclose}
        aria-label="Close commander damage">×</button
      >
    </header>

    <ul class="rows">
      {#each rows as { opponent, total } (opponent.id)}
        <li class="row" data-lethal={total >= LETHAL_COMMANDER_DAMAGE}>
          <span class="row__who" data-colour={opponent.colour}>
            <ManaPip colour={opponent.colour} size={18} />
            <span class="row__name">{opponent.name}</span>
          </span>
          <button
            class="step"
            aria-label="Remove one commander damage to {player.name} from {opponent.name}"
            disabled={total === 0}
            onclick={() => onchange(opponent.id, -1)}>−</button
          >
          <!-- The digit and the spoken phrase are separate: interpolating a
               leading space inside the hidden span gets trimmed away, and the
               screen reader hears "1from Player 2". -->
          <span class="row__total" aria-live="polite">
            <span aria-hidden="true">{total}</span>
            <span class="sr-only">{total} from {opponent.name}</span>
          </span>
          <button
            class="step"
            aria-label="Add one commander damage to {player.name} from {opponent.name}"
            onclick={() => onchange(opponent.id, 1)}>+</button
          >
        </li>
      {/each}
    </ul>

    <p class="foot">Twenty-one from any single commander is lethal.</p>
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
    width: min(24rem, 100%);
    max-height: 100%;
    padding: var(--space-4);
    overflow-y: auto;
    border: 1px solid var(--frame-rule-strong);
    border-radius: var(--radius-lg);
    background: linear-gradient(175deg, var(--player-ink), var(--surface-panel) 85%);
    box-shadow: var(--shadow-float);
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
    color: var(--text-gold);
    font-family: var(--font-display);
    font-size: 1rem;
    letter-spacing: var(--tracking-display);
  }

  .close {
    display: grid;
    flex: none;
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

  .row__who {
    display: flex;
    gap: var(--space-2);
    align-items: center;
    min-width: 0;
  }

  .row__name {
    overflow: hidden;
    color: var(--text-muted);
    font-size: 0.9rem;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .row__total {
    font-family: var(--font-numeric);
    font-size: 1.1rem;
    font-weight: 700;
    font-variant-numeric: tabular-nums;
    text-align: center;
  }

  .row[data-lethal='true'] .row__total {
    color: var(--danger);
  }

  .step {
    display: grid;
    place-items: center;
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

  .foot {
    margin: 0;
    color: var(--text-faint);
    font-size: 0.8rem;
    text-align: center;
  }
</style>
