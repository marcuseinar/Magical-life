<script lang="ts">
  import { FORMATS } from '$domain/rules';
  import { createGameStore } from '$lib/gameStore.svelte';
  import GameBoard from '$ui/components/GameBoard.svelte';
  import NewGameSheet from '$ui/components/NewGameSheet.svelte';

  const store = createGameStore();

  let confirmingNewGame = $state(false);

  $effect(() => {
    void store.hydrate();
  });
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
      onLifeChange={(player, delta) => store.changeLife(player.id, delta)}
      onCounterChange={(player, counter, delta) => store.changeCounter(player.id, counter, delta)}
      onElimination={(player, eliminated) => store.setEliminated(player.id, eliminated)}
    />

    <nav class="toolbar" aria-label="Game">
      <button class="tool" onclick={() => store.undo()}>Undo</button>
      <button class="tool" onclick={() => (confirmingNewGame = true)}>New game</button>
    </nav>
  </main>

  {#if confirmingNewGame}
    <div class="scrim">
      <div class="confirm" role="dialog" aria-modal="true" aria-labelledby="confirm-title">
        <h2 id="confirm-title" class="confirm__title">End this game?</h2>
        <p class="confirm__body">The current life totals will be cleared.</p>
        <div class="confirm__actions">
          <button class="tool" onclick={() => (confirmingNewGame = false)}>Keep playing</button>
          <button
            class="tool tool--danger"
            onclick={async () => {
              confirmingNewGame = false;
              await store.abandon();
            }}>End game</button
          >
        </div>
      </div>
    </div>
  {/if}
{/if}

<style>
  .game {
    display: grid;
    grid-template-rows: 1fr auto;
    min-height: 0;
  }

  .toolbar {
    display: flex;
    gap: var(--space-2);
    justify-content: center;
    padding: var(--space-2) var(--space-3) var(--space-3);
  }

  .tool {
    padding: var(--space-2) var(--space-4);
    border: 1px solid var(--frame-rule);
    border-radius: var(--radius-pill);
    background: var(--surface-sunken);
    color: var(--text-muted);
    font-size: 0.85rem;
    letter-spacing: 0.1em;
    text-transform: uppercase;
  }

  .tool--danger {
    border-color: var(--danger);
    color: var(--danger);
  }

  .scrim {
    position: fixed;
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
