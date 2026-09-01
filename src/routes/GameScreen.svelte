<script lang="ts">
  import { FORMATS } from '$domain/rules';
  import type { CounterKind } from '$domain/rules';
  import type { PlayerId } from '$domain/ids';
  import { localSeats } from '$domain/selectors';
  import type { PlayerState } from '$domain/state';
  import type { GameStore } from '$lib/gameStore.svelte';
  import { WINNER_BLINK_MS } from '$ui/interaction/firstPlayerSpin';
  import { createSpinController } from '$ui/interaction/spinController.svelte';
  import { flushPending } from '$ui/interaction/pendingFlush';
  import CommanderSheet from '$ui/components/CommanderSheet.svelte';
  import CounterSheet from '$ui/components/CounterSheet.svelte';
  import RenameSheet from '$ui/components/RenameSheet.svelte';
  import GameBoard from '$ui/components/GameBoard.svelte';
  import NewGameSheet from '$ui/components/NewGameSheet.svelte';
  import TableSheet from './TableSheet.svelte';

  let { store }: { store: GameStore } = $props();

  const spin = createSpinController();

  type Confirmation = 'rematch' | 'new-game';

  let confirming = $state<Confirmation | null>(null);
  let counters = $state<{ player: PlayerState; rotated: boolean } | null>(null);
  let commander = $state<{ player: PlayerState; rotated: boolean } | null>(null);
  let renaming = $state<{ player: PlayerState; rotated: boolean } | null>(null);
  let connecting = $state(false);
  let rolled = $state<string | null>(null);
  /** Covers the whole roll, including the storage write before the spin starts,
   *  so the winner is never revealed a frame early. */
  let rolling = $state(false);
  /** The winner, while their panel is blinking. */
  let celebrating = $state<PlayerId | null>(null);
  let blinkTimer: ReturnType<typeof setTimeout> | undefined;

  $effect(() => {
    void store.hydrate();
  });

  /*
   * A change counting down on a panel is on screen but not yet in the log, so
   * a reload — or switching apps and never coming back — would lose it. Both
   * events, because neither fires reliably alone on a phone: iOS often ends a
   * page at `pagehide` without `visibilitychange`, and a tab switch is the
   * reverse. Flushing twice is a no-op, so the overlap costs nothing.
   */
  $effect(() => {
    const flush = () => flushPending();
    const onHidden = () => {
      if (document.visibilityState === 'hidden') flush();
    };
    window.addEventListener('pagehide', flush);
    document.addEventListener('visibilitychange', onHidden);

    return () => {
      window.removeEventListener('pagehide', flush);
      document.removeEventListener('visibilitychange', onHidden);
    };
  });

  /* A sheet holds a snapshot, so it has to follow the live player. */
  const live = (id: PlayerId | undefined) =>
    id === undefined ? null : (store.state?.players.find((player) => player.id === id) ?? null);

  const openPlayer = $derived(live(counters?.player.id));
  const commanderPlayer = $derived(live(commander?.player.id));

  const renamingPlayer = $derived(
    renaming === null
      ? null
      : (store.state?.players.find((player) => player.id === renaming?.player.id) ?? null)
  );

  /** `null` until a table is actually connected: nothing is locked in solo
   *  or shared-device play, which never claims a seat at all. */
  const localSeatIds = $derived(
    store.state === null
      ? null
      : new Set(localSeats(store.state, store.authorId).map((player) => player.id))
  );

  async function roll() {
    if (rolling) return;

    rolling = true;
    rolled = null;
    try {
      // Decided first and written to the log; the spin only reveals it.
      const result = await store.chooseFirstPlayer();
      if (!result.ok) return;

      const players = store.state?.players ?? [];
      const seat = players.findIndex((player) => player.id === result.value);
      if (seat === -1) return;

      await spin.run(players.length, seat);
      rolled = players[seat]?.name ?? null;

      // Blink the winner so a table of six all see it without being told.
      clearTimeout(blinkTimer);
      celebrating = result.value;
      blinkTimer = setTimeout(() => (celebrating = null), WINNER_BLINK_MS);
    } finally {
      rolling = false;
    }
  }

  async function confirm() {
    const action = confirming;
    confirming = null;
    rolled = null;
    spin.stop();
    clearTimeout(blinkTimer);
    celebrating = null;
    // Both of these throw the current game away, so a change still counting
    // down on a panel has to land in its history first or it never happened.
    flushPending();
    if (action === 'rematch') await store.rematch();
    if (action === 'new-game') await store.abandon();
  }
</script>

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
      firstPlayer={rolling ? null : store.state.firstPlayer}
      spotlight={spin.spotlight}
      {celebrating}
      {localSeatIds}
      onLifeChange={(player, delta, from) => store.changeLife(player.id, delta, from)}
      tracksCommanderDamage={store.state.config.tracksCommanderDamage}
      onOpenCounters={(player, rotated) => (counters = { player, rotated })}
      onOpenCommander={(player, rotated) => (commander = { player, rotated })}
      onRename={(player, rotated) => (renaming = { player, rotated })}
      onElimination={(player, eliminated) => store.setEliminated(player.id, eliminated)}
    />

    <nav class="toolbar" aria-label="Game">
      <!-- Flush first: the panels' totals already count what is pending, so
           undoing past it would step back through a change still on screen. -->
      <button
        class="tool"
        onclick={() => {
          flushPending();
          void store.undo();
        }}>Undo</button
      >
      <!-- Short visible label so four actions fit one row on a phone; the
           accessible name spells it out and contains the visible text. -->
      <button class="tool" onclick={roll} disabled={rolling} aria-label="Choose who goes first"
        >First</button
      >
      <button class="tool" onclick={() => (confirming = 'rematch')}>Rematch</button>
      <button class="tool" onclick={() => (confirming = 'new-game')}>New game</button>
    </nav>

    <!-- Deliberately not in the toolbar above: a fifth pill there wraps to a
         second row on a phone (asserted by an existing test), and this is a
         once-per-game setup action, not something reached for mid-play the
         way Undo or Rematch are — it does not need equal billing. -->
    <button class="connect" onclick={() => (connecting = true)}>Connect a table</button>

    <p class="announce" role="status" data-rolled={rolled !== null}>
      {rolled === null ? '' : `${rolled} goes first`}
    </p>
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

  {#if commanderPlayer !== null && commander !== null}
    <CommanderSheet
      player={commanderPlayer}
      opponents={(store.state?.players ?? []).filter((other) => other.id !== commanderPlayer.id)}
      rotated={commander.rotated}
      onchange={(from: PlayerId, delta: number) =>
        store.changeCommanderDamage(commanderPlayer.id, from, delta)}
      onclose={() => (commander = null)}
    />
  {/if}

  {#if renamingPlayer !== null && renaming !== null}
    <RenameSheet
      player={renamingPlayer}
      rotated={renaming.rotated}
      onrename={async (name: string) => {
        await store.rename(renamingPlayer.id, name);
        renaming = null;
      }}
      onclose={() => (renaming = null)}
    />
  {/if}

  {#if connecting}
    <TableSheet {store} onclose={() => (connecting = false)} />
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

  .tool:disabled {
    opacity: 0.45;
    cursor: default;
  }

  .connect {
    justify-self: center;
    padding: var(--space-1) var(--space-3);
    margin-top: var(--space-1);
    color: var(--text-muted);
    font-size: 0.68rem;
    letter-spacing: 0.03em;
    text-decoration: underline;
    text-underline-offset: 2px;
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

  .announce[data-rolled='true'] {
    animation: declare var(--duration-slow) var(--ease-out);
  }

  @keyframes declare {
    from {
      transform: translateY(0.4em);
      opacity: 0;
    }

    to {
      transform: translateY(0);
      opacity: 1;
    }
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
