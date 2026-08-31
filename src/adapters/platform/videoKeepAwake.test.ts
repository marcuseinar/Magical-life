// @vitest-environment jsdom
//
// The one adapter test outside `component` that needs a real DOM: this
// touches `document`, `HTMLCanvasElement` and `HTMLVideoElement` directly,
// none of which the `unit` project's Node environment provides.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createVideoKeepAwake } from './videoKeepAwake';

// None of these three exist on jsdom's prototypes at all, so each is patched
// in with a bare `delete` to restore — not vi.restoreAllMocks(), which only
// undoes vi.spyOn and leaves a manual Object.defineProperty in place, letting
// one test's stub leak into the next.
const patchedProperties: Array<{ target: object; name: string }> = [];

function patch(target: object, name: string, value: unknown) {
  Object.defineProperty(target, name, { configurable: true, value, writable: true });
  patchedProperties.push({ target, name });
}

function stubMediaApis() {
  const stream = {};
  const captureStream = vi.fn().mockReturnValue(stream);
  const play = vi.fn().mockResolvedValue(undefined);

  patch(HTMLCanvasElement.prototype, 'captureStream', captureStream);
  patch(HTMLVideoElement.prototype, 'play', play);
  // jsdom has no MediaStream/srcObject support at all; a plain writable
  // property is enough for this adapter, which never reads it back.
  patch(HTMLVideoElement.prototype, 'srcObject', null);

  return { captureStream, play };
}

describe('createVideoKeepAwake', () => {
  afterEach(() => {
    document.body.innerHTML = '';
    for (const { target, name } of patchedProperties.splice(0)) {
      delete (target as Record<string, unknown>)[name];
    }
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('plays a hidden, muted, looping video fed by a captured canvas stream, resolving true', async () => {
    const { captureStream, play } = stubMediaApis();

    await expect(createVideoKeepAwake().start()).resolves.toBe(true);

    expect(captureStream).toHaveBeenCalledTimes(1);
    const video = document.querySelector('video');
    expect(video).not.toBeNull();
    expect(video?.muted).toBe(true);
    expect(video?.loop).toBe(true);
    expect(video?.playsInline).toBe(true);
    expect(play).toHaveBeenCalledTimes(1);
  });

  it('does not create a second video when started twice', async () => {
    const { captureStream } = stubMediaApis();

    const keepAwake = createVideoKeepAwake();
    await keepAwake.start();
    await keepAwake.start();

    expect(captureStream).toHaveBeenCalledTimes(1);
    expect(document.querySelectorAll('video')).toHaveLength(1);
  });

  it('removes the video on stop, and stopping twice is safe', async () => {
    stubMediaApis();

    const keepAwake = createVideoKeepAwake();
    await keepAwake.start();
    keepAwake.stop();
    keepAwake.stop();

    expect(document.querySelectorAll('video')).toHaveLength(0);
  });

  it('resumes playback on a later start() after the browser paused it', async () => {
    const { play } = stubMediaApis();

    const keepAwake = createVideoKeepAwake();
    await keepAwake.start();
    const video = document.querySelector('video')!;
    patch(video, 'paused', true);

    await expect(keepAwake.start()).resolves.toBe(true);

    expect(play).toHaveBeenCalledTimes(2);
  });

  it('resolves false, without throwing, when captureStream is unsupported', async () => {
    // No stubMediaApis() call — jsdom's real (missing) canvas/video APIs apply.
    await expect(createVideoKeepAwake().start()).resolves.toBe(false);
    expect(document.querySelectorAll('video')).toHaveLength(0);
  });

  it('resolves false, without throwing, when play() rejects', async () => {
    stubMediaApis();
    patch(
      HTMLVideoElement.prototype,
      'play',
      vi.fn().mockRejectedValue(new Error('NotAllowedError'))
    );

    await expect(createVideoKeepAwake().start()).resolves.toBe(false);
  });

  it('falls back to checking `paused` when play() never settles its promise — a real WebKit quirk for a MediaStream-sourced video, seen even once playback has genuinely started', async () => {
    vi.useFakeTimers();
    patch(HTMLCanvasElement.prototype, 'captureStream', vi.fn().mockReturnValue({}));
    patch(HTMLVideoElement.prototype, 'srcObject', null);
    patch(
      HTMLVideoElement.prototype,
      'play',
      vi.fn(function (this: HTMLVideoElement) {
        patch(this, 'paused', false);
        return new Promise(() => {});
      })
    );

    const started = createVideoKeepAwake().start();
    await vi.advanceTimersByTimeAsync(300);

    await expect(started).resolves.toBe(true);
  });
});
