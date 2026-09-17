<script lang="ts">
  import '@fontsource/cinzel/latin-400.css';
  import '@fontsource/cinzel/latin-700.css';
  import '@fontsource/cinzel/latin-900.css';
  import '$ui/tokens/base.css';
  import { createBrowserWakeLock } from '$adapters/platform/wakeLock';
  import { createGameStore } from '$lib/gameStore.svelte';
  import { createTableSession } from '$lib/tableSession.svelte';
  import { defaultSignalling } from '$lib/signalling';
  import { provideGameStore, provideTableSession } from '$lib/context';

  let { children } = $props();

  /*
   * The one game, owned above every screen rather than by whichever screen
   * happens to be showing (ADR 0005). This is what makes setup and settings
   * reachable without the game having to stop existing first — a route
   * change unmounts a page, and the game must survive being looked away
   * from.
   *
   * Reached through context rather than props because SvelteKit routes
   * cannot be prop-drilled through the router. `/join` is the one exception:
   * it builds its own store for the table it joins.
   */
  const store = createGameStore();
  provideGameStore(store);

  /*
   * And the table it is hosting, for the same reason. It opens nothing until
   * something asks it to, so a solo game never touches the network — but
   * once open it is the game's table, not the sheet's: a code that changed
   * every time somebody glanced at who had joined is a code nobody can be
   * given in advance, which is the whole point of having one (ADR 0006).
   */
  provideTableSession(createTableSession(store, defaultSignalling()));

  $effect(() => {
    void store.hydrate();
  });

  /*
   * A life counter that lets the screen lock mid-game is failing at its one
   * job. The lock is never requested without a tap behind it: a request on
   * page load, with no gesture, came back denied on a real iPhone and left
   * the screen sleeping through a game. Pegasus
   * (github.com/dannyrhubarb/pegasus), whose web build keeps the same phone
   * lit through hands-off replay playback, only ever asks from inside a
   * click handler — so this does too, and the listener stays armed until a
   * request is actually granted rather than giving up after one refusal.
   *
   * After that first grant, two things still need a retry, neither needing
   * another tap:
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

    let hasGesture = false;
    const onTap = () => {
      hasGesture = true;
      void wakeLock.request().then((acquired) => {
        if (acquired) document.removeEventListener('pointerdown', onTap);
      });
    };
    document.addEventListener('pointerdown', onTap);

    const onVisible = () => {
      if (hasGesture && document.visibilityState === 'visible') void wakeLock.request();
    };
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      document.removeEventListener('pointerdown', onTap);
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

<style>
  .app {
    display: grid;

    /*
     * Explicit, because the implicit column a bare `display: grid` creates is
     * `auto` — sized to the max-content of whatever screen is showing. The
     * board's max-content exceeds a phone, so the game filled the width and
     * looked fine; setup's does not, so it laid itself out at the width of
     * its own widest line (the title, ~275px on a 390px phone) and every
     * screen under it inherited that. Two-column layouts inside then dropped
     * to one and the screen grew too tall to fit.
     */
    grid-template-columns: minmax(0, 1fr);
    grid-template-rows: 1fr;
    height: 100dvh;
    overflow: hidden;

    /* Never let a life total hide behind a notch. */
    padding: env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom)
      env(safe-area-inset-left);
  }
</style>
