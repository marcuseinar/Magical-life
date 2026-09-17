import { afterEach, describe, expect, it, vi } from 'vitest';
import { presetConfig } from '$domain/rules';
import { createGameStore } from './gameStore.svelte';
import { hostTable } from './tableConnection.svelte';
import { createMemoryEventLog } from '$adapters/storage/memoryEventLog';
import { fakeSignalling, stubGatheredPeerConnection } from '../../tests/fakes/table';

const startedGame = async () => {
  const store = createGameStore({ log: createMemoryEventLog() });
  await store.hydrate();
  await store.begin(presetConfig('commander'), [{ name: 'Anna', colour: 'green' }]);
  return store;
};

afterEach(() => vi.useRealTimers());

/*
 * The poll is the heartbeat: it is what tells the worker the host is still
 * here, and it is the only way an answer ever reaches the host. Since the
 * table now stays open for the whole game rather than only while its sheet
 * is on screen, the rate it runs at is the difference between a heartbeat
 * and a phone asking a server something every second and a half all evening.
 */
describe('hosting a table', () => {
  it('asks every gap while the sheet is open, and ten times less often when it is not', async () => {
    stubGatheredPeerConnection();
    vi.useFakeTimers();
    const signalling = fakeSignalling();
    let polls = 0;
    const counted = {
      ...signalling.signalling,
      poll: async (...args: Parameters<typeof signalling.signalling.poll>) => {
        polls++;
        return signalling.signalling.poll(...args);
      }
    };

    const host = hostTable(await startedGame(), counted);
    await vi.advanceTimersByTimeAsync(0);
    expect(host.code).toBe('CODE1');

    const unwatch = host.watch();
    await vi.advanceTimersByTimeAsync(1500);
    expect(polls, 'watched').toBe(1);
    await vi.advanceTimersByTimeAsync(1500);
    expect(polls, 'watched').toBe(2);

    unwatch();
    await vi.advanceTimersByTimeAsync(1500 * 9);
    expect(polls, 'nobody looking: still inside one gap').toBe(2);
    await vi.advanceTimersByTimeAsync(1500);
    expect(polls, 'nobody looking: one gap later').toBe(3);

    // And looking again does not leave the next answer sitting for a gap.
    host.watch();
    await vi.advanceTimersByTimeAsync(1500);
    expect(polls, 'watched again').toBe(4);

    host.stop();
  });
});
