<script lang="ts">
  import type { PlayerId } from '$domain/ids';
  import type { PlayerState } from '$domain/state';
  import type { GameSummary, Placing } from '$domain/summary';

  /**
   * The end of a game: who won, who went out to what, and how long it took —
   * and the way into the next one, which is where Rematch is actually wanted
   * (`docs/design/shell-and-lobby.md`).
   */
  let {
    summary,
    players,
    onrematch,
    onnewgame,
    onclose
  }: {
    summary: GameSummary;
    players: readonly PlayerState[];
    onrematch: () => void;
    onnewgame: () => void;
    onclose: () => void;
  } = $props();

  const nameOf = (id: PlayerId) => players.find((player) => player.id === id)?.name ?? '';

  const winnerName = $derived(summary.winner === null ? null : nameOf(summary.winner));

  const ORDINALS = ['1st', '2nd', '3rd', '4th', '5th', '6th'];

  const commanderHit = (placing: Placing) =>
    placing.worstCommander === null
      ? null
      : `${placing.worstCommander.damage} commander damage from ${nameOf(placing.worstCommander.from)}`;

  /* Commander damage first: a player at zero life with twenty-one from one
     commander went out to the commander, and saying "life" would hide it. */
  function cause(placing: Placing): string {
    if (placing.reasons.includes('commander')) return commanderHit(placing) ?? 'Commander damage';

    const headline =
      placing.player === summary.winner
        ? 'Winner'
        : placing.reasons.includes('poison')
          ? 'Poison'
          : placing.reasons.includes('life')
            ? 'Life'
            : 'Out';
    const hit = commanderHit(placing);
    return hit === null ? headline : `${headline} · ${hit}`;
  }

  function length(ms: number): string {
    const minutes = Math.floor(Math.max(0, ms) / 60_000);
    if (minutes < 1) return 'Under a minute';
    if (minutes < 60) return `${minutes} min`;
    return `${Math.floor(minutes / 60)} h ${minutes % 60} min`;
  }
</script>

<svelte:window
  onkeydown={(event) => {
    if (event.key === 'Escape') onclose();
  }}
/>

<div class="scrim">
  <div class="sheet" role="dialog" aria-modal="true" aria-labelledby="summary-title">
    <h2 id="summary-title" class="title">
      {winnerName === null ? 'No winner' : `${winnerName} wins`}
    </h2>

    <p class="length">
      <span class="length__label">Game length</span>
      <span>{length(summary.endedAt - summary.startedAt)}</span>
    </p>

    <ol class="placings" aria-label="Placings">
      {#each summary.placings as placing (placing.player)}
        <li class="placing" data-winner={placing.player === summary.winner}>
          <span class="placing__place">{ORDINALS[placing.place - 1]}</span>
          <span class="placing__name">{nameOf(placing.player)}</span>
          <span class="placing__cause">{cause(placing)}</span>
        </li>
      {/each}
    </ol>

    <div class="actions">
      <button class="action" type="button" onclick={onclose}>Back to the board</button>
      <button class="action" type="button" onclick={onnewgame}>New game</button>
      <button class="action action--go" type="button" onclick={onrematch}>Rematch</button>
    </div>
  </div>
</div>

<style>
  .scrim {
    position: fixed;
    z-index: 25;
    inset: 0;
    display: grid;
    place-items: center;
    padding: var(--space-4);
    background: var(--surface-scrim);
  }

  .sheet {
    display: grid;
    gap: var(--space-3);
    width: min(24rem, 100%);
    padding: var(--space-4);
    border: 1px solid var(--frame-rule-strong);
    border-radius: var(--radius-lg);
    background: var(--surface-panel);
    box-shadow: var(--shadow-float);
  }

  .title {
    margin: 0;
    color: var(--text-gold);
    font-family: var(--font-display);
    font-size: 1.35rem;
    letter-spacing: var(--tracking-display);
    text-align: center;
  }

  .length {
    display: flex;
    gap: var(--space-2);
    justify-content: center;
    margin: 0;
    color: var(--text-primary);
    font-family: var(--font-numeric);
    font-size: 0.9rem;
  }

  .length__label {
    color: var(--text-muted);
    font-family: var(--font-body);
  }

  .placings {
    display: grid;
    gap: var(--space-1);
    margin: 0;
    padding: 0;
    list-style: none;
  }

  /* Two lines per row at most, so six players still fit a phone without
     scrolling: place and name on top, the cause underneath. */
  .placing {
    display: grid;
    grid-template-columns: 2.5em 1fr;
    column-gap: var(--space-2);
    padding: var(--space-1) var(--space-2);
    border: 1px solid transparent;
    border-radius: var(--radius-md);
    background: var(--surface-sunken);
  }

  .placing[data-winner='true'] {
    border-color: var(--frame-rule-strong);
  }

  .placing__place {
    grid-row: span 2;
    align-self: center;
    color: var(--text-gold);
    font-family: var(--font-numeric);
  }

  .placing__name {
    overflow: hidden;
    color: var(--text-primary);
    font-family: var(--font-display);
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .placing__cause {
    color: var(--text-muted);
    font-size: 0.75rem;
  }

  .actions {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-2);
    justify-content: flex-end;
  }

  .action {
    min-height: 2.75rem;
    padding: 0 var(--space-3);
    border: 1px solid var(--frame-rule);
    border-radius: var(--radius-pill);
    color: var(--text-muted);
    font-size: 0.8rem;
    letter-spacing: 0.06em;
    text-transform: uppercase;
  }

  .action--go {
    border-color: var(--frame-rule-strong);
    color: var(--text-gold);
  }
</style>
