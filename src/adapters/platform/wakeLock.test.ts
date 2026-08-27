import { afterEach, describe, expect, it, vi } from 'vitest';
import { createBrowserWakeLock } from './wakeLock';

describe('createBrowserWakeLock', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('does nothing when the API does not exist', async () => {
    vi.stubGlobal('navigator', {});
    const wakeLock = createBrowserWakeLock();

    await expect(wakeLock.request()).resolves.toBeUndefined();
    await expect(wakeLock.release()).resolves.toBeUndefined();
  });

  it('requests a screen lock and releases the sentinel it gets back', async () => {
    const release = vi.fn().mockResolvedValue(undefined);
    const request = vi.fn().mockResolvedValue({ release });
    vi.stubGlobal('navigator', { wakeLock: { request } });

    const wakeLock = createBrowserWakeLock();
    await wakeLock.request();

    expect(request).toHaveBeenCalledWith('screen');
    expect(release).not.toHaveBeenCalled();

    await wakeLock.release();
    expect(release).toHaveBeenCalledTimes(1);
  });

  it('releasing twice only releases the sentinel once', async () => {
    const release = vi.fn().mockResolvedValue(undefined);
    const request = vi.fn().mockResolvedValue({ release });
    vi.stubGlobal('navigator', { wakeLock: { request } });

    const wakeLock = createBrowserWakeLock();
    await wakeLock.request();
    await wakeLock.release();
    await wakeLock.release();

    expect(release).toHaveBeenCalledTimes(1);
  });

  it('does not throw when the browser refuses the request', async () => {
    const request = vi.fn().mockRejectedValue(new Error('denied'));
    vi.stubGlobal('navigator', { wakeLock: { request } });

    const wakeLock = createBrowserWakeLock();
    await expect(wakeLock.request()).resolves.toBeUndefined();
  });

  it('releasing after a refused request is a no-op', async () => {
    const request = vi.fn().mockRejectedValue(new Error('denied'));
    vi.stubGlobal('navigator', { wakeLock: { request } });

    const wakeLock = createBrowserWakeLock();
    await wakeLock.request();
    await expect(wakeLock.release()).resolves.toBeUndefined();
  });
});
