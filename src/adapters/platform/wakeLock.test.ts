import { afterEach, describe, expect, it, vi } from 'vitest';
import { createBrowserWakeLock } from './wakeLock';

function fakeSentinel() {
  const listeners: Record<string, (() => void)[]> = {};
  return {
    release: vi.fn().mockResolvedValue(undefined),
    addEventListener: vi.fn((type: string, handler: () => void) => {
      (listeners[type] ??= []).push(handler);
    }),
    fireRelease: () => {
      for (const handler of listeners.release ?? []) handler();
    }
  };
}

describe('createBrowserWakeLock', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('does nothing when the API does not exist', async () => {
    vi.stubGlobal('navigator', {});
    const wakeLock = createBrowserWakeLock();

    await expect(wakeLock.request()).resolves.toBe(false);
    await expect(wakeLock.release()).resolves.toBeUndefined();
  });

  it('requests a screen lock and releases the sentinel it gets back', async () => {
    const sentinel = fakeSentinel();
    const request = vi.fn().mockResolvedValue(sentinel);
    vi.stubGlobal('navigator', { wakeLock: { request } });

    const wakeLock = createBrowserWakeLock();
    await expect(wakeLock.request()).resolves.toBe(true);

    expect(request).toHaveBeenCalledWith('screen');
    expect(sentinel.release).not.toHaveBeenCalled();

    await wakeLock.release();
    expect(sentinel.release).toHaveBeenCalledTimes(1);
  });

  it('releasing twice only releases the sentinel once', async () => {
    const sentinel = fakeSentinel();
    const request = vi.fn().mockResolvedValue(sentinel);
    vi.stubGlobal('navigator', { wakeLock: { request } });

    const wakeLock = createBrowserWakeLock();
    await wakeLock.request();
    await wakeLock.release();
    await wakeLock.release();

    expect(sentinel.release).toHaveBeenCalledTimes(1);
  });

  it('does not throw when the browser refuses the request', async () => {
    const request = vi.fn().mockRejectedValue(new Error('denied'));
    vi.stubGlobal('navigator', { wakeLock: { request } });

    const wakeLock = createBrowserWakeLock();
    await expect(wakeLock.request()).resolves.toBe(false);
  });

  it('releasing after a refused request is a no-op', async () => {
    const request = vi.fn().mockRejectedValue(new Error('denied'));
    vi.stubGlobal('navigator', { wakeLock: { request } });

    const wakeLock = createBrowserWakeLock();
    await wakeLock.request();
    await expect(wakeLock.release()).resolves.toBeUndefined();
  });

  describe('unexpected release', () => {
    // Real behaviour, not hypothetical: the browser (iOS Safari especially)
    // can revoke a lock on its own, at any time, without the tab ever going
    // hidden — the one event `visibilitychange` would catch. The sentinel's
    // own `release` event is the only signal for that, so it has to be
    // watched too, or the screen quietly starts sleeping again with nothing
    // in this module able to notice.

    it('calls back when the browser revokes the lock on its own', async () => {
      const sentinel = fakeSentinel();
      const request = vi.fn().mockResolvedValue(sentinel);
      vi.stubGlobal('navigator', { wakeLock: { request } });
      const onReleased = vi.fn();

      const wakeLock = createBrowserWakeLock(onReleased);
      await wakeLock.request();
      sentinel.fireRelease();

      expect(onReleased).toHaveBeenCalledTimes(1);
    });

    it('does not call back when we release it ourselves', async () => {
      const sentinel = fakeSentinel();
      sentinel.release.mockImplementation(async () => {
        sentinel.fireRelease();
      });
      const request = vi.fn().mockResolvedValue(sentinel);
      vi.stubGlobal('navigator', { wakeLock: { request } });
      const onReleased = vi.fn();

      const wakeLock = createBrowserWakeLock(onReleased);
      await wakeLock.request();
      await wakeLock.release();

      expect(onReleased).not.toHaveBeenCalled();
    });

    it('ignores a stale sentinel superseded by a newer request', async () => {
      const first = fakeSentinel();
      const second = fakeSentinel();
      const request = vi.fn().mockResolvedValueOnce(first).mockResolvedValueOnce(second);
      vi.stubGlobal('navigator', { wakeLock: { request } });
      const onReleased = vi.fn();

      const wakeLock = createBrowserWakeLock(onReleased);
      await wakeLock.request();
      await wakeLock.request();
      first.fireRelease();

      expect(onReleased).not.toHaveBeenCalled();
    });
  });
});
