<script lang="ts">
  import type { PlayerId } from '$domain/ids';
  import type { PlayerState } from '$domain/state';
  import PlayerPanel from './PlayerPanel.svelte';

  let {
    players,
    firstPlayer = null,
    spotlight = null,
    celebrating = null,
    tracksCommanderDamage = false,
    onLifeChange,
    onOpenCounters,
    onOpenCommander,
    onElimination
  }: {
    players: readonly PlayerState[];
    firstPlayer?: PlayerId | null;
    /** Seat index under the travelling spotlight, if one is running. */
    spotlight?: number | null;
    /** Player who has just won the roll, blinking to announce it. */
    celebrating?: PlayerId | null;
    tracksCommanderDamage?: boolean;
    onLifeChange: (player: PlayerState, delta: number, from: PlayerId | null) => void;
    onOpenCounters: (player: PlayerState, rotated: boolean) => void;
    onOpenCommander: (player: PlayerState, rotated: boolean) => void;
    onElimination: (player: PlayerState, eliminated: boolean) => void;
  } = $props();

  /* One and two players read best stacked; three and up want a grid. */
  /* Every seat, in order: the panel needs them all, since a stolen commander
     can hit its own owner. */
  const seats = $derived(players);

  const columns = $derived(players.length <= 2 ? 1 : 2);
  const rows = $derived(Math.ceil(players.length / columns));

  /** Everyone in the top row is sitting opposite, so their panel is upside down. */
  const isRotated = (index: number) => players.length > 1 && index < columns;

  /** An odd player out takes the whole width rather than leaving a hole. */
  const spansRow = (index: number) =>
    columns === 2 && players.length % 2 === 1 && index === players.length - 1;
</script>

<div
  class="board"
  style:--columns={columns}
  style:--rows={rows}
  role="group"
  aria-label="Life totals"
>
  {#each players as player, index (player.id)}
    <div class="cell" data-span={spansRow(index)}>
      <PlayerPanel
        {player}
        rotated={isRotated(index)}
        isFirstPlayer={player.id === firstPlayer}
        spotlit={index === spotlight}
        celebrating={player.id === celebrating}
        dimmed={spotlight !== null && index !== spotlight}
        {tracksCommanderDamage}
        {seats}
        onLifeChange={(delta, from) => onLifeChange(player, delta, from)}
        onOpenCounters={() => onOpenCounters(player, isRotated(index))}
        onOpenCommander={() => onOpenCommander(player, isRotated(index))}
        onElimination={(eliminated) => onElimination(player, eliminated)}
      />
    </div>
  {/each}
</div>

<style>
  .board {
    display: grid;
    grid-template-rows: repeat(var(--rows), minmax(0, 1fr));
    grid-template-columns: repeat(var(--columns), minmax(0, 1fr));
    gap: var(--space-2);
    min-height: 0;
    padding: var(--space-2);
  }

  .cell {
    display: grid;
    min-width: 0;
    min-height: 0;
  }

  .cell[data-span='true'] {
    grid-column: 1 / -1;
  }

  /* Wide screens get more columns rather than stretched panels. Layout is the
     only thing a breakpoint is allowed to change. */
  @media (width >= 60rem) and (orientation: landscape) {
    .board {
      grid-template-rows: repeat(2, minmax(0, 1fr));
      grid-template-columns: repeat(auto-fit, minmax(18rem, 1fr));
    }

    .cell[data-span='true'] {
      grid-column: auto;
    }
  }
</style>
