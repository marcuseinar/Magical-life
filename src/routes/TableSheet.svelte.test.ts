import { MAX_PLAYERS, presetConfig } from '$domain/rules';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/svelte';
import TableSheet from './TableSheet.svelte';
import { createGameStore } from '$lib/gameStore.svelte';
import { createTableSession } from '$lib/tableSession.svelte';
import type { TableSession } from '$lib/tableSession.svelte';
import { createMemoryEventLog } from '$adapters/storage/memoryEventLog';
import {
  fakeSignalling,
  stubGatheredPeerConnection,
  stubGatheringPeerConnection
} from '../../tests/fakes/table';

const seatPlayers = async () => {
  const store = createGameStore({ log: createMemoryEventLog() });
  await store.hydrate();
  await store.begin(presetConfig('commander'), [
    { name: 'Anna', colour: 'green' },
    { name: 'Björn', colour: 'blue' },
    { name: 'Cara', colour: 'red' }
  ]);
  return store;
};

/* The table is the game's now, not the sheet's, so a test hands the sheet
 * one the same way the layout does. */
const sessions: TableSession[] = [];
const sessionFor = (
  store: Awaited<ReturnType<typeof seatPlayers>>,
  signalling = fakeSignalling()
) => {
  const session = createTableSession(store, signalling.signalling);
  sessions.push(session);
  return session;
};

const mount = (store: Awaited<ReturnType<typeof seatPlayers>>, session = sessionFor(store)) =>
  render(TableSheet, { props: { store, session, onclose: () => {} } });

beforeEach(stubGatheringPeerConnection);
afterEach(() => {
  for (const session of sessions.splice(0)) session.stop();
});

describe('table sheet', () => {
  /*
   * One code for the table, not one per person (ADR 0006). The seat list is
   * there to answer "is everyone in yet?", which previously needed the host
   * to remember who they had already invited.
   */
  it('shows every seat and whether it is taken, without offering to invite each one', async () => {
    const store = await seatPlayers();
    const bjorn = store.state!.players.find((player) => player.name === 'Björn')!;
    await store.claimSeat(bjorn.id);

    mount(store);

    expect(screen.getByText('Anna')).toBeInTheDocument();
    expect(screen.getByText('Björn')).toBeInTheDocument();
    expect(screen.getByText('Cara')).toBeInTheDocument();
    expect(screen.getAllByText('free')).toHaveLength(2);
    expect(screen.getAllByText('joined')).toHaveLength(1);

    expect(screen.queryByRole('button', { name: 'Invite Anna' })).not.toBeInTheDocument();
  });

  /*
   * The no-server path is per-seat because it has to be: a QR handshake is
   * one offer shown to one scanner. So the fallback asks whose seat first.
   */
  it('asks which seat a hand-carried code is for, and skips the ones already taken', async () => {
    const store = await seatPlayers();
    const bjorn = store.state!.players.find((player) => player.name === 'Björn')!;
    await store.claimSeat(bjorn.id);

    mount(store);
    await fireEvent.click(screen.getByRole('button', { name: /paste a code instead/i }));

    expect(screen.getByRole('button', { name: 'Invite Anna' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Invite Cara' })).toBeEnabled();
    expect(screen.getByRole('button', { name: /björn.*joined/i })).toBeDisabled();
  });

  /*
   * Opening a table is a round trip, and what used to fill that moment was a
   * single line of text — so the sheet arrived small and then grew a code, a
   * QR and a button underneath whatever the player was already reaching for.
   * It is its finished size from the first frame now: the code and the QR are
   * pending rather than absent, and the button says why it cannot be pressed.
   */
  it('shows the code and the QR as pending rather than leaving them out', async () => {
    const store = await seatPlayers();

    mount(store);

    expect(screen.getByRole('status')).toHaveTextContent('Opening a table…');
    expect(screen.getByRole('button', { name: /preparing the link/i })).toBeDisabled();
    expect(screen.queryByRole('button', { name: 'Copy link' })).not.toBeInTheDocument();
  });

  it('says the code is on its way on the hand-carried path too', async () => {
    const store = await seatPlayers();

    mount(store);
    await fireEvent.click(screen.getByRole('button', { name: /paste a code instead/i }));
    await fireEvent.click(screen.getByRole('button', { name: 'Invite Anna' }));

    expect(screen.getByRole('status')).toHaveTextContent('Preparing a code…');
    expect(screen.getByRole('button', { name: /preparing the code/i })).toBeDisabled();
  });

  /*
   * The bug this replaced: the sheet started a table of its own when it
   * opened and stopped it when it closed, so every look at who had joined
   * issued a new code — and whoever had been given the old one was pointing
   * at a table with nobody listening on it.
   */
  it('shows the code it was already given rather than opening another table', async () => {
    stubGatheredPeerConnection();
    const store = await seatPlayers();
    const signalling = fakeSignalling();
    const session = sessionFor(store, signalling);

    const sheet = mount(store, session);
    expect(await screen.findByText('CODE1')).toBeInTheDocument();
    sheet.unmount();

    mount(store, session);

    expect(await screen.findByText('CODE1')).toBeInTheDocument();
    expect(signalling.tablesOpened()).toBe(1);
  });

  /*
   * J3 in the shell-and-lobby design: a fifth player shows up mid-game. The
   * table already advertises whichever seats are free, so growing the table
   * is the one new thing this needs — the same QR then offers the new seat
   * like any other.
   */
  it('lets the host add a seat to a running game', async () => {
    const store = await seatPlayers();

    mount(store);
    await fireEvent.click(screen.getByRole('button', { name: 'Add a seat' }));

    expect(await screen.findByText('Player 4')).toBeInTheDocument();
    expect(screen.getAllByText('free')).toHaveLength(4);
  });

  it('stops offering to add a seat once the table is full', async () => {
    const store = await seatPlayers();
    for (let i = store.state!.players.length; i < MAX_PLAYERS; i++) {
      await store.addSeat(`Player ${i + 1}`, 'red');
    }

    mount(store);

    expect(screen.queryByRole('button', { name: 'Add a seat' })).not.toBeInTheDocument();
  });
});
