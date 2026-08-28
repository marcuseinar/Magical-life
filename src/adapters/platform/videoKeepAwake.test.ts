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
  });

  it('plays a hidden, muted, looping video fed by a captured canvas stream', () => {
    const { captureStream, play } = stubMediaApis();

    createVideoKeepAwake().start();

    expect(captureStream).toHaveBeenCalledTimes(1);
    const video = document.querySelector('video');
    expect(video).not.toBeNull();
    expect(video?.muted).toBe(true);
    expect(video?.loop).toBe(true);
    expect(video?.playsInline).toBe(true);
    expect(play).toHaveBeenCalledTimes(1);
  });

  it('does not create a second video when started twice', () => {
    const { captureStream } = stubMediaApis();

    const keepAwake = createVideoKeepAwake();
    keepAwake.start();
    keepAwake.start();

    expect(captureStream).toHaveBeenCalledTimes(1);
    expect(document.querySelectorAll('video')).toHaveLength(1);
  });

  it('removes the video on stop, and stopping twice is safe', () => {
    stubMediaApis();

    const keepAwake = createVideoKeepAwake();
    keepAwake.start();
    keepAwake.stop();
    keepAwake.stop();

    expect(document.querySelectorAll('video')).toHaveLength(0);
  });

  it('resumes playback on a later start() after the browser paused it', () => {
    const { play } = stubMediaApis();

    const keepAwake = createVideoKeepAwake();
    keepAwake.start();
    const video = document.querySelector('video')!;
    patch(video, 'paused', true);

    keepAwake.start();

    expect(play).toHaveBeenCalledTimes(2);
  });

  it('does not throw when captureStream is unsupported', () => {
    // No stubMediaApis() call — jsdom's real (missing) canvas/video APIs apply.
    expect(() => createVideoKeepAwake().start()).not.toThrow();
    expect(document.querySelectorAll('video')).toHaveLength(0);
  });

  it('does not throw when play() rejects', () => {
    stubMediaApis();
    patch(
      HTMLVideoElement.prototype,
      'play',
      vi.fn().mockRejectedValue(new Error('NotAllowedError'))
    );

    expect(() => createVideoKeepAwake().start()).not.toThrow();
  });
});
