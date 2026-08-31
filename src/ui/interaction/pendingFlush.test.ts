import { describe, expect, it, vi } from 'vitest';
import { flushPending, registerPendingFlush } from './pendingFlush';

describe('pending flush registry', () => {
  it('flushes everything registered', () => {
    const anna = vi.fn();
    const bjorn = vi.fn();
    const stopAnna = registerPendingFlush(anna);
    const stopBjorn = registerPendingFlush(bjorn);

    flushPending();

    expect(anna).toHaveBeenCalledTimes(1);
    expect(bjorn).toHaveBeenCalledTimes(1);
    stopAnna();
    stopBjorn();
  });

  it('leaves a deregistered panel alone, so a destroyed one cannot be commanded', () => {
    const gone = vi.fn();
    registerPendingFlush(gone)();

    flushPending();

    expect(gone).not.toHaveBeenCalled();
  });

  it('survives a flush that deregisters mid-iteration', () => {
    // Committing can tear down the panel that registered the flusher, which
    // would otherwise be a mutation of the set being walked.
    const second = vi.fn();
    const stopSecond = registerPendingFlush(() => second());
    const stopFirst = registerPendingFlush(() => stopSecond());

    expect(() => flushPending()).not.toThrow();
    expect(second).toHaveBeenCalledTimes(1);
    stopFirst();
  });

  it('flushing with nothing registered is harmless', () => {
    expect(() => flushPending()).not.toThrow();
  });
});
