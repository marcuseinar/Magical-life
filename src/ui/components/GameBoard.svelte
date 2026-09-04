<script lang="ts">
  import type { PlayerId } from '$domain/ids';
  import type { PlayerState } from '$domain/state';
  import PlayerPanel from './PlayerPanel.svelte';

  let {
    players,
    seats = players,
    firstPlayer = null,
    spotlight = null,
    celebrating = null,
    localSeatIds = null,
    tracksCommanderDamage = false,
    onLifeChange,
    onOpenCounters,
    onOpenCommander,
    onRename,
    onElimination
  }: {
    /** Who gets a panel. Everyone at the table, unless the opponent bar has
     *  taken the rest of them off the board — see `seats` below. */
    players: readonly PlayerState[];
    /** Every seat in the game, for commander-damage attribution: who a loss
     *  can be blamed on. Defaults to `players`, which is every seat whenever
     *  the board itself is showing the whole table. Passed separately once
     *  it is not — an opponent moved to the bar can still have dealt the
     *  damage a local panel is asking who dealt it to. */
    seats?: readonly PlayerState[];
    firstPlayer?: PlayerId | null;
    /** Seat index under the travelling spotlight, if one is running. */
    spotlight?: number | null;
    /** Player who has just won the roll, blinking to announce it. */
    celebrating?: PlayerId | null;
    /** Which seats this device may play, from `localSeats`. `null` means no
     *  table is connected yet, so nothing is locked — the common case, and
     *  the only one solo and shared-device play ever see. */
    localSeatIds?: ReadonlySet<PlayerId> | null;
    tracksCommanderDamage?: boolean;
    onLifeChange: (player: PlayerState, delta: number, from: PlayerId | null) => void;
    onOpenCounters: (player: PlayerState, rotated: boolean) => void;
    onOpenCommander: (player: PlayerState, rotated: boolean) => void;
    onRename: (player: PlayerState, rotated: boolean) => void;
    onElimination: (player: PlayerState, eliminated: boolean) => void;
  } = $props();

  /* One and two players read best stacked; three and up want a grid. */
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
        readOnly={localSeatIds !== null && !localSeatIds.has(player.id)}
        {tracksCommanderDamage}
        {seats}
        onLifeChange={(delta, from) => onLifeChange(player, delta, from)}
        onOpenCounters={() => onOpenCounters(player, isRotated(index))}
        onOpenCommander={() => onOpenCommander(player, isRotated(index))}
        onRename={() => onRename(player, isRotated(index))}
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
