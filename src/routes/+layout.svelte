<script lang="ts">
  import '@fontsource/cinzel/latin-400.css';
  import '@fontsource/cinzel/latin-700.css';
  import '@fontsource/cinzel/latin-900.css';
  import '$ui/tokens/base.css';
  import { createBrowserWakeLock } from '$adapters/platform/wakeLock';

  let { children } = $props();

  // The commit this was built from, set by CI — 'dev' locally, where there
  // is no fixed build to name. Exists so "is this actually the latest
  // version" is a glance, not a guess, especially on a phone that may be
  // holding onto a cached PWA build.
  const appVersion = ((import.meta.env.VITE_APP_VERSION as string | undefined) ?? 'dev').slice(
    0,
    7
  );

  /*
   * A life counter that lets the screen lock mid-game is failing at its one
   * job. Two separate reasons the lock can be gone, both needing the same
   * response — ask again:
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
    wakeLock = createBrowserWakeLock(() => void wakeLock.request());
    void wakeLock.request();

    const onVisible = () => {
      if (document.visibilityState === 'visible') void wakeLock.request();
    };
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      void wakeLock.release();
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
<span class="version" aria-hidden="true">{appVersion}</span>

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
