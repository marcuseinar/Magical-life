<script lang="ts">
  import type { QrScanner } from '$application/ports/scanner';

  let {
    scanner,
    title = 'Scan a code',
    body = 'Point the camera at the code.',
    onscan,
    onclose
  }: {
    scanner: QrScanner;
    title?: string;
    body?: string;
    onscan: (text: string) => void;
    onclose: () => void;
  } = $props();

  let video = $state<HTMLVideoElement | null>(null);
  let cameraError = $state(false);
  let stop: (() => void) | null = null;

  /* `video` only becomes non-null once the <video> element in the template
   * mounts, so this effect's one real dependency is "the element exists" —
   * it starts the camera exactly once per mount, and its teardown is what
   * turns it back off, covering Cancel, Escape, and the sheet being torn
   * down for any other reason (a route change, a parent re-rendering). */
  $effect(() => {
    const el = video;
    if (el === null) return;

    let torndown = false;
    void scanner
      .start(el, (text) => {
        if (!torndown) onscan(text);
      })
      .then((stopFn) => {
        if (torndown) {
          stopFn();
          return;
        }
        stop = stopFn;
      })
      .catch(() => {
        cameraError = true;
      });

    return () => {
      torndown = true;
      stop?.();
      stop = null;
    };
  });

  // Stop the camera here rather than only in the effect's teardown: Cancel
  // and Escape both call this before the parent gets around to unmounting
  // the sheet, and the light staying on for even one extra render is the
  // kind of thing that gets an app flagged as untrustworthy.
  function close() {
    stop?.();
    stop = null;
    onclose();
  }
</script>

<svelte:window
  onkeydown={(event) => {
    if (event.key === 'Escape') close();
  }}
/>

<div class="scrim">
  <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
  <div class="scrim__hit" onclick={close}></div>

  <div class="sheet" role="dialog" aria-modal="true" aria-labelledby="scan-title">
    <h2 id="scan-title" class="title">{title}</h2>

    {#if cameraError}
      <p class="error" role="alert">
        Couldn't open the camera. Check it has permission, or use a code you paste instead.
      </p>
    {:else}
      <p class="body" role="status">{body}</p>
      <div class="preview">
        <video
          bind:this={video}
          class="video"
          autoplay
          muted
          playsinline
          aria-label="Camera preview"
        ></video>
      </div>
    {/if}

    <div class="actions">
      <button class="action" type="button" onclick={close}>Cancel</button>
    </div>
  </div>
</div>

<style>
  .scrim {
    position: fixed;
    z-index: 20;
    inset: 0;
    display: grid;
    place-items: center;
    padding: var(--space-4);
    background: var(--surface-scrim);
  }

  .scrim__hit {
    position: absolute;
    inset: 0;
  }

  .sheet {
    position: relative;
    display: grid;
    gap: var(--space-3);
    width: min(24rem, 100%);
    padding: var(--space-4);
    border: 1px solid var(--frame-rule-strong);
    border-radius: var(--radius-lg);
    background: var(--surface-panel);
    box-shadow: var(--shadow-float);
  }

  .title {
    margin: 0;
    color: var(--text-gold);
    font-family: var(--font-display);
    font-size: 1.1rem;
    letter-spacing: var(--tracking-display);
  }

  .body {
    margin: 0;
    color: var(--text-muted);
    font-size: 0.85rem;
    line-height: 1.5;
  }

  .error {
    margin: 0;
    color: var(--danger);
    font-size: 0.85rem;
    line-height: 1.5;
  }

  .preview {
    overflow: hidden;
    aspect-ratio: 1;
    border-radius: var(--radius-md);
    background: black;
  }

  .video {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .actions {
    display: flex;
    gap: var(--space-2);
    justify-content: flex-end;
  }

  .action {
    min-height: 2.75rem;
    padding: 0 var(--space-4);
    border: 1px solid var(--frame-rule);
    border-radius: var(--radius-pill);
    color: var(--text-muted);
    font-size: 0.85rem;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }
</style>
