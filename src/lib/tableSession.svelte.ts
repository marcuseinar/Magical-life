import type { Signalling } from '$application/ports/signalling';
import type { GameStore } from './gameStore.svelte';
import { hostTable } from './tableConnection.svelte';
import type { TableHost } from './tableConnection.svelte';

/**
 * One table for the game, rather than one per look at it.
 *
 * ADR 0006's whole claim is that a table has *one* code — one to read out,
 * one QR, one link, with the offer behind them rotating. That only holds if
 * the table outlives the sheet showing it: a table started when the sheet
 * opens and stopped when it closes issues a fresh code every time somebody
 * checks who has joined, and the code already given out keeps existing at
 * the worker for another ten minutes with nobody listening on it — claimable,
 * answerable, and silently dead.
 *
 * So the table is opened once, lazily — a solo game never touches the
 * network — and then held for as long as the game lasts. The host's poll is
 * what holds it open (see the `Signalling` port), and it slows down by
 * itself while nobody is watching.
 */
export type TableSession = {
  /** The running table, or `null` if one has never been opened. */
  readonly host: TableHost | null;
  /** Opens the table, or hands back the one already open. */
  open(): TableHost;
  /** Gives up the table and stops watching the game for the end of it. */
  stop(): void;
};

export function createTableSession(store: GameStore, signalling: Signalling): TableSession {
  let host = $state<TableHost | null>(null);

  const letGo = () => {
    host?.stop();
    host = null;
  };

  /*
   * A table belongs to a game. Clearing the history ends the game, and a
   * table still heartbeating after that is offering seats at a table nobody
   * is sitting at. Starting a *new* game is not that: the seats change, the
   * table does not, which is what lets somebody be invited to a rematch on
   * the code they already have.
   */
  const stopWatchingTheGame = $effect.root(() => {
    $effect(() => {
      // Deliberately the only thing read here: an effect tracks what it
      // actually reads on a given run, so guarding this with `store.ready`
      // would take no dependency on the state at all while hydration is
      // still in flight — which is exactly when this is set up. There is
      // nothing to let go of before a game exists anyway.
      if (store.state === null) letGo();
    });
  });

  return {
    get host() {
      return host;
    },
    open() {
      // A failed host is not reusable — its loop has already ended. Opening
      // the sheet again is the natural moment to try the network once more.
      if (host === null || host.error) {
        host?.stop();
        host = hostTable(store, signalling);
      }
      return host;
    },
    stop() {
      stopWatchingTheGame();
      letGo();
    }
  };
}
