<script lang="ts">
  import '@fontsource/cinzel/latin-400.css';
  import '@fontsource/cinzel/latin-700.css';
  import '@fontsource/cinzel/latin-900.css';
  import '$ui/tokens/base.css';
  import { createBrowserWakeLock } from '$adapters/platform/wakeLock';
  import { createVideoKeepAwake } from '$adapters/platform/videoKeepAwake';

  let { children } = $props();

  // The commit this was built from, set by CI — 'dev' locally, where there
  // is no fixed build to name. Exists so "is this actually the latest
  // version" is a glance, not a guess, especially on a phone that may be
  // holding onto a cached PWA build.
  const appVersion = ((import.meta.env.VITE_APP_VERSION as string | undefined) ?? 'dev').slice(
    0,
    7
  );

  // Both keep-awake mechanisms below can report success on a device where the
  // screen still sleeps — that gap can only be closed by seeing, on the
  // actual device, whether the browser genuinely granted them. Shown next to
  // the version for the same reason: a glance, not a guess, without needing
  // a remote debugger.
  let wakeLockStatus = $state<'pending' | 'granted' | 'denied'>('pending');
  let videoStatus = $state<'pending' | 'playing' | 'blocked'>('pending');

  /*
   * A life counter that lets the screen lock mid-game is failing at its one
   * job. This used to also request on load, with no gesture behind it, and
   * fall back to a gesture-gated retry only once that failed — but a real
   * iPhone kept reporting `wl:denied` even after the retry fired. Pegasus
   * (github.com/dannyrhubarb/pegasus), whose web build genuinely does not
   * lock the screen during hands-off replay playback on the same phone,
   * never makes that first request until a real tap has happened — every
   * call in its `syncWakeLock()` is downstream of a menu click. Matching
   * that exactly: no request before the first tap, at all.
   *
   * After that first grant, two reasons still need a retry, both without
   * needing another tap:
   *
   * 1. The browser releases it whenever the tab goes to the background —
   *    switching apps, the phone's own screen timeout firing first — caught
   *    by `visibilitychange`.
   * 2. iOS Safari in particular has also been seen revoking it unprompted,
   *    with the tab never going hidden at all — the screen just starts
   *    sleeping again a few minutes in. `visibilitychange` cannot see that;
   *    only the sentinel's own `release` event can, which is what
   *    `onReleased` below is wired to.
   */
  $effect(() => {
    let wakeLock: ReturnType<typeof createBrowserWakeLock>;
    const requestWakeLock = () =>
      wakeLock.request().then((acquired) => {
        wakeLockStatus = acquired ? 'granted' : 'denied';
        return acquired;
      });
    wakeLock = createBrowserWakeLock(() => void requestWakeLock());

    let hasGesture = false;
    const onTap = () => {
      hasGesture = true;
      void requestWakeLock().then((acquired) => {
        if (acquired) document.removeEventListener('pointerdown', onTap);
      });
    };
    document.addEventListener('pointerdown', onTap);

    const onVisible = () => {
      if (hasGesture && document.visibilityState === 'visible') void requestWakeLock();
    };
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      document.removeEventListener('pointerdown', onTap);
      document.removeEventListener('visibilitychange', onVisible);
      void wakeLock.release();
    };
  });

  /*
   * Belt-and-suspenders alongside the Wake Lock API above: iOS Safari has
   * been seen resolving a wake lock request that does not actually stop the
   * screen from sleeping (a known bug in standalone/home-screen mode fixed
   * only in iOS 18.4), so success there is not proof the screen will stay
   * lit. A muted, looping, otherwise-invisible video is a second, unrelated
   * mechanism for the same effect that does not depend on that API working
   * at all — restarted on the same visibilitychange signal in case the
   * browser paused it while backgrounded.
   */
  $effect(() => {
    const videoKeepAwake = createVideoKeepAwake();
    const startVideo = () =>
      void videoKeepAwake.start().then((playing) => {
        videoStatus = playing ? 'playing' : 'blocked';
      });
    startVideo();

    const onVisible = () => {
      if (document.visibilityState === 'visible') startVideo();
    };
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      videoKeepAwake.stop();
    };
  });

  /*
   * Safari on iOS honours neither `user-scalable=no` nor `touch-action` for its
   * own pinch gesture on the page, so the gesture events are cancelled directly.
   * Non-Safari browsers never fire these and are unaffected.
   */
  function blockPinch(event: Event) {
    event.preventDefault();
  }

  $effect(() => {
    // Not in Svelte's document typings — these events are Safari-only.
    for (const name of ['gesturestart', 'gesturechange', 'gestureend']) {
      document.addEventListener(name, blockPinch, { passive: false });
    }
    return () => {
      for (const name of ['gesturestart', 'gesturechange', 'gestureend']) {
        document.removeEventListener(name, blockPinch);
      }
    };
  });
</script>

<div class="app">
  {@render children()}
</div>

<!-- Never intercepts a tap: this is the one thing on screen allowed to sit
     over gameplay, so it must never be able to steal a gesture from it. -->
<span class="version" aria-hidden="true"
  >{appVersion} · wl:{wakeLockStatus} · vid:{videoStatus}</span
>

<style>
  .app {
    display: grid;
    grid-template-rows: 1fr;
    height: 100dvh;
    overflow: hidden;

    /* Never let a life total hide behind a notch. */
    padding: env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom)
      env(safe-area-inset-left);
  }

  .version {
    position: fixed;
    right: calc(env(safe-area-inset-right) + var(--space-1));
    bottom: calc(env(safe-area-inset-bottom) + var(--space-1));
    color: var(--text-muted);
    font-size: 0.55rem;
    opacity: 0.5;
    pointer-events: none;
    user-select: none;
  }
</style>
