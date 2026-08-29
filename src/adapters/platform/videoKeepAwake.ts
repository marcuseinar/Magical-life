/**
 * A muted, looping video fed by a 1×1 captured canvas stream — invisible,
 * with no bundled asset — kept playing for as long as the game is open.
 *
 * Belt-and-suspenders alongside the Screen Wake Lock API: iOS Safari has
 * been seen resolving a wake lock request that does not actually stop the
 * screen from sleeping, particularly in standalone (home-screen) mode
 * before iOS 18.4. A muted video playing in the page is independently known
 * to keep the screen lit — the same technique the NoSleep.js library uses —
 * and does not depend on the Wake Lock API working at all.
 */
export type VideoKeepAwake = {
  /** Resolves to whether the video is actually playing. */
  start(): Promise<boolean>;
  stop(): void;
};

/**
 * WebKit has been seen leaving the promise from `HTMLVideoElement.play()`
 * pending forever for a MediaStream-sourced video — even once `paused` has
 * already flipped to false and playback is genuinely under way. Waiting on
 * that promise alone would report "pending" forever on exactly the device
 * this mechanism targets, so it races a short, bounded check of `paused`
 * alongside it as a fallback signal the hang doesn't affect.
 */
async function attemptPlay(element: HTMLVideoElement): Promise<boolean> {
  let played: boolean | undefined;
  const settled = element
    .play()
    .then(() => {
      played = true;
    })
    .catch(() => {
      played = false;
    });

  await Promise.race([settled, new Promise((resolve) => setTimeout(resolve, 300))]);

  return played ?? !element.paused;
}

export function createVideoKeepAwake(): VideoKeepAwake {
  let video: HTMLVideoElement | null = null;

  return {
    async start() {
      try {
        if (video) {
          return video.paused ? await attemptPlay(video) : true;
        }

        const canvas = document.createElement('canvas');
        canvas.width = 1;
        canvas.height = 1;
        canvas.getContext('2d')?.fillRect(0, 0, 1, 1);
        const stream = canvas.captureStream(1);

        const element = document.createElement('video');
        element.muted = true;
        element.loop = true;
        element.playsInline = true;
        element.setAttribute('aria-hidden', 'true');
        element.style.position = 'fixed';
        element.style.width = '1px';
        element.style.height = '1px';
        element.style.opacity = '0';
        element.style.pointerEvents = 'none';
        element.srcObject = stream;
        document.body.appendChild(element);
        video = element;

        return await attemptPlay(element);
      } catch {
        video = null;
        return false;
      }
    },
    stop() {
      video?.remove();
      video = null;
    }
  };
}
