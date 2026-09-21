import { afterEach, describe, expect, it, vi } from 'vitest';
import { presetConfig } from '$domain/rules';
import { createGameStore } from './gameStore.svelte';
import { createTableSession } from './tableSession.svelte';
import type { TableSession } from './tableSession.svelte';
import { createMemoryEventLog } from '$adapters/storage/memoryEventLog';
import { fakeSignalling, stubGatheredPeerConnection } from '../../tests/fakes/table';

const startedGame = async () => {
  const store = createGameStore({ log: createMemoryEventLog() });
  await store.hydrate();
  await store.begin(presetConfig('commander'), [{ name: 'Anna', colour: 'green' }]);
  return store;
};

const open: TableSession[] = [];
const sessionFor = (
  store: Awaited<ReturnType<typeof startedGame>>,
  signalling = fakeSignalling()
) => {
  const session = createTableSession(store, signalling.signalling);
  open.push(session);
  return session;
};

afterEach(() => {
  // Each one is polling on a timer of its own until it is told to stop.
  for (const session of open.splice(0)) session.stop();
});

/*
 * The table belongs to the game, not to the sheet that shows it. It used to
 * be started by the sheet's own effect and stopped when the sheet closed, so
 * every look at the table issued a *new* code — and the code somebody had
 * already been given went on existing at the worker for another ten minutes
 * with nobody listening on it, which is worse than it expiring.
 */
describe('table session', () => {
  it('opens one table however often it is asked', async () => {
    stubGatheredPeerConnection();
    const signalling = fakeSignalling();
    const session = sessionFor(await startedGame(), signalling);

    const first = session.open();
    await vi.waitFor(() => expect(first.code).toBe('CODE1'));

    const second = session.open();

    expect(second).toBe(first);
    expect(second.code).toBe('CODE1');
    expect(signalling.tablesOpened()).toBe(1);
  });

  it('tries the network again when a table could not be opened at all', async () => {
    stubGatheredPeerConnection();
    const signalling = fakeSignalling();
    let offline = true;
    const flaky = {
      ...signalling.signalling,
      openTable: async (...args: Parameters<typeof signalling.signalling.openTable>) => {
        if (offline) throw new Error('no network');
        return signalling.signalling.openTable(...args);
      }
    };
    const session = createTableSession(await startedGame(), flaky);
    open.push(session);

    const failed = session.open();
    await vi.waitFor(() => expect(failed.error).toBe(true));

    offline = false;
    const retried = session.open();

    expect(retried).not.toBe(failed);
    await vi.waitFor(() => expect(retried.code).toBe('CODE1'));
  });

  /*
   * The host's own way to end a table early — dropping it and starting a
   * fresh one, rather than waiting for the game itself to end. `open()`
   * afterwards must build a genuinely new table, not hand back the stopped
   * one: the worker has already been told (via its own stopped run loop) that
   * nobody is polling it anymore, so the code it issued is on its way out.
   */
  it('drops the table on request, ready to open a fresh one', async () => {
    stubGatheredPeerConnection();
    const store = await startedGame();
    const signalling = fakeSignalling();
    const session = sessionFor(store, signalling);

    const first = session.open();
    await vi.waitFor(() => expect(first.code).toBe('CODE1'));

    session.drop();
    expect(session.host).toBe(null);

    const second = session.open();
    expect(second).not.toBe(first);
    await vi.waitFor(() => expect(second.code).toBe('CODE2'));
    expect(signalling.tablesOpened()).toBe(2);
  });

  it('lets the table go when the game does', async () => {
    stubGatheredPeerConnection();
    const store = await startedGame();
    const session = sessionFor(store);

    session.open();
    await vi.waitFor(() => expect(session.host?.code).toBe('CODE1'));

    await store.clearHistory();

    await vi.waitFor(() => expect(session.host).toBe(null));
  });
});
