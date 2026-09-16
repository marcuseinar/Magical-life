import { presetConfig } from '$domain/rules';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/svelte';
import TableSheet from './TableSheet.svelte';
import { createGameStore } from '$lib/gameStore.svelte';
import { createMemoryEventLog } from '$adapters/storage/memoryEventLog';

const seatPlayers = async () => {
  const store = createGameStore({ log: createMemoryEventLog() });
  await store.begin(presetConfig('commander'), [
    { name: 'Anna', colour: 'green' },
    { name: 'Björn', colour: 'blue' },
    { name: 'Cara', colour: 'red' }
  ]);
  return store;
};

/*
 * jsdom has no WebRTC, and the hand-carried path builds a peer connection the
 * moment a seat is picked. This stands in for one still gathering candidates
 * — which is the state under test, and the only one these tests reach.
 */
class StillGathering {
  createDataChannel() {
    return { addEventListener() {}, readyState: 'connecting', close() {} };
  }
  createOffer() {
    return new Promise(() => {});
  }
  addEventListener() {}
  removeEventListener() {}
  close() {}
}
vi.stubGlobal('RTCPeerConnection', StillGathering);

const mount = (store: Awaited<ReturnType<typeof seatPlayers>>) =>
  render(TableSheet, { props: { store, onclose: () => {} } });

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
});
