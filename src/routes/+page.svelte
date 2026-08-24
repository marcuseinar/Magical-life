<script lang="ts">
  import { FORMATS } from '$domain/rules';
  import type { CounterKind } from '$domain/rules';
  import type { PlayerState } from '$domain/state';
  import { createGameStore } from '$lib/gameStore.svelte';
  import CounterSheet from '$ui/components/CounterSheet.svelte';
  import GameBoard from '$ui/components/GameBoard.svelte';
  import NewGameSheet from '$ui/components/NewGameSheet.svelte';

  const store = createGameStore();

  type Confirmation = 'rematch' | 'new-game';

  let confirming = $state<Confirmation | null>(null);
  let counters = $state<{ player: PlayerState; rotated: boolean } | null>(null);
  let rolled = $state<string | null>(null);

  $effect(() => {
    void store.hydrate();
  });

  /* The sheet holds a snapshot, so it has to follow the live player. */
  const openPlayer = $derived(
    counters === null
      ? null
      : (store.state?.players.find((player) => player.id === counters?.player.id) ?? null)
  );

  async function roll() {
    const result = await store.chooseFirstPlayer();
    if (!result.ok) return;
    rolled = store.state?.players.find((player) => player.id === result.value)?.name ?? null;
  }

  async function confirm() {
    const action = confirming;
    confirming = null;
    rolled = null;
    if (action === 'rematch') await store.rematch();
    if (action === 'new-game') await store.abandon();
  }
</script>

<svelte:head>
  <title>Magical Life</title>
</svelte:head>

{#if !store.ready}
  <p class="sr-only">Loading</p>
{:else if store.state === null}
  <NewGameSheet onstart={(formatId, seats) => store.begin(formatId, seats)} />
{:else}
  <main class="game">
    <h1 class="sr-only">
      Magical Life — {FORMATS[store.state.config.format].name}, {store.state.players.length}
      {store.state.players.length === 1 ? 'player' : 'players'}
    </h1>

    <GameBoard
      players={store.state.players}
      firstPlayer={store.state.firstPlayer}
      onLifeChange={(player, delta) => store.changeLife(player.id, delta)}
      onOpenCounters={(player, rotated) => (counters = { player, rotated })}
      onElimination={(player, eliminated) => store.setEliminated(player.id, eliminated)}
    />

    <nav class="toolbar" aria-label="Game">
      <button class="tool" onclick={() => store.undo()}>Undo</button>
      <!-- Short visible label so four actions fit one row on a phone; the
           accessible name spells it out and contains the visible text. -->
      <button class="tool" onclick={roll} aria-label="Choose who goes first">First</button>
      <button class="tool" onclick={() => (confirming = 'rematch')}>Rematch</button>
      <button class="tool" onclick={() => (confirming = 'new-game')}>New game</button>
    </nav>

    <p class="announce" role="status">{rolled === null ? '' : `${rolled} goes first`}</p>
  </main>

  {#if openPlayer !== null && counters !== null}
    <CounterSheet
      player={openPlayer}
      rotated={counters.rotated}
      onchange={(counter: CounterKind, delta: number) =>
        store.changeCounter(openPlayer.id, counter, delta)}
      onclose={() => (counters = null)}
    />
  {/if}

  {#if confirming !== null}
    <div class="scrim">
      <div class="confirm" role="dialog" aria-modal="true" aria-labelledby="confirm-title">
        <h2 id="confirm-title" class="confirm__title">
          {confirming === 'rematch' ? 'Start a rematch?' : 'End this game?'}
        </h2>
        <p class="confirm__body">
          {confirming === 'rematch'
            ? 'Same players, same format, fresh totals.'
            : 'The current life totals will be cleared.'}
        </p>
        <div class="confirm__actions">
          <button class="tool" onclick={() => (confirming = null)}>Keep playing</button>
          <button class="tool tool--danger" onclick={confirm}>
            {confirming === 'rematch' ? 'Rematch' : 'End game'}
          </button>
        </div>
      </div>
    </div>
  {/if}
{/if}

<style>
  .game {
    display: grid;
    grid-template-rows: 1fr auto auto;
    min-height: 0;
  }

  .toolbar {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-2);
    justify-content: center;
    padding: var(--space-2) var(--space-3) 0;
  }

  .tool {
    padding: var(--space-2) var(--space-3);
    border: 1px solid var(--frame-rule);
    border-radius: var(--radius-pill);
    background: var(--surface-sunken);
    color: var(--text-muted);

    /* Tight enough that all four actions sit on one row on a phone. */
    font-size: 0.72rem;
    letter-spacing: 0.03em;
    text-transform: uppercase;
    white-space: nowrap;
  }

  .tool--danger {
    border-color: var(--danger);
    color: var(--danger);
  }

  .announce {
    min-height: 1.4em;
    margin: 0;
    padding: var(--space-1) var(--space-3) var(--space-2);
    color: var(--text-gold);
    font-family: var(--font-display);
    font-size: 0.9rem;
    letter-spacing: var(--tracking-display);
    text-align: center;
  }

  .scrim {
    position: fixed;
    z-index: 30;
    inset: 0;
    display: grid;
    place-items: center;
    padding: var(--space-4);
    background: var(--surface-scrim);
  }

  .confirm {
    display: grid;
    gap: var(--space-3);
    width: min(24rem, 100%);
    padding: var(--space-5);
    border: 1px solid var(--frame-rule);
    border-radius: var(--radius-lg);
    background: var(--surface-panel);
    box-shadow: var(--shadow-float);
    text-align: center;
  }

  .confirm__title {
    margin: 0;
    color: var(--text-gold);
    font-family: var(--font-display);
    font-size: 1.35rem;
    letter-spacing: var(--tracking-display);
  }

  .confirm__body {
    margin: 0;
    color: var(--text-muted);
    font-size: 0.9rem;
  }

  .confirm__actions {
    display: flex;
    gap: var(--space-2);
    justify-content: center;
  }
</style>
