<script lang="ts">
  import { joinTable, whoIsThisFor } from '$lib/tableConnection.svelte';
  import type { Invitation } from '$lib/tableConnection.svelte';
  import GameScreen from '../GameScreen.svelte';

  type Stage =
    | { readonly kind: 'paste' }
    | { readonly kind: 'confirm'; readonly invitation: Invitation; readonly code: string }
    | { readonly kind: 'connecting'; readonly invitation: Invitation }
    | { readonly kind: 'playing' };

  let stage = $state<Stage>({ kind: 'paste' });
  let draft = $state('');
  let pasteError = $state(false);
  let joined = $state<ReturnType<typeof joinTable> | null>(null);
  let copied = $state(false);

  function readCode() {
    const invitation = whoIsThisFor(draft);
    if (invitation === null) {
      pasteError = true;
      return;
    }
    pasteError = false;
    stage = { kind: 'confirm', invitation, code: draft };
  }

  function beginJoin() {
    if (stage.kind !== 'confirm') return;
    joined = joinTable(stage.code);
    stage = { kind: 'connecting', invitation: stage.invitation };
  }

  async function copyReply() {
    const reply = joined?.reply;
    if (reply === null || reply === undefined) return;
    try {
      await navigator.clipboard.writeText(reply);
      copied = true;
    } catch {
      // The reply field beneath the button is still selectable by hand.
    }
  }

  $effect(() => {
    if (joined?.store !== null && joined !== null && stage.kind === 'connecting') {
      stage = { kind: 'playing' };
    }
  });
</script>

<svelte:head>
  <title>Join a table — Magical Life</title>
</svelte:head>

{#if stage.kind === 'playing' && joined?.store}
  <GameScreen store={joined.store} />
{:else}
  <main class="join">
    <header class="masthead">
      <h1 class="title">Join a table</h1>
      <p class="tagline">Very early — no QR code yet. Paste the code the host sent you.</p>
    </header>

    {#if stage.kind === 'paste'}
      <form
        class="group"
        onsubmit={(event) => {
          event.preventDefault();
          readCode();
        }}
      >
        <label class="field">
          <span class="label">Their code</span>
          <textarea
            bind:value={draft}
            class="code"
            rows="4"
            autocomplete="off"
            spellcheck="false"
            placeholder="Paste it here"></textarea>
        </label>
        {#if pasteError}
          <p class="error" role="alert">
            That did not look like an invite code. Check it was copied in full.
          </p>
        {/if}
        <button class="action action--go" type="submit" disabled={draft.trim() === ''}>
          Continue
        </button>
      </form>
    {:else if stage.kind === 'confirm'}
      <div class="group">
        <p class="body">Join as <strong>{stage.invitation.playerName}</strong>?</p>
        <button class="action action--go" type="button" onclick={beginJoin}>Join</button>
      </div>
    {:else if stage.kind === 'connecting' && joined}
      <div class="group">
        <p class="body">
          Send this back to {joined ? stage.invitation.playerName : ''} — whoever invited you.
        </p>
        {#if joined.reply === null}
          <p class="body" role="status">Preparing a reply…</p>
        {:else}
          <div class="code-row">
            <textarea class="code" readonly value={joined.reply} rows="4"></textarea>
            <button class="action" type="button" onclick={copyReply}>
              {copied ? 'Copied' : 'Copy'}
            </button>
          </div>
          <p class="body" role="status">Waiting for them to connect…</p>
        {/if}
      </div>
    {/if}
  </main>
{/if}

<style>
  .join {
    display: grid;
    align-content: start;
    gap: var(--space-4);
    height: 100%;
    padding: var(--space-5) var(--space-4);
    overflow-y: auto;
    touch-action: pan-y;
  }

  .masthead {
    display: grid;
    gap: var(--space-1);
    text-align: center;
  }

  .title {
    margin: 0;
    color: var(--text-gold);
    font-family: var(--font-display);
    font-size: 1.6rem;
    letter-spacing: var(--tracking-display);
  }

  .tagline {
    margin: 0;
    color: var(--text-muted);
    font-size: 0.85rem;
  }

  .group {
    display: grid;
    gap: var(--space-3);
    width: min(26rem, 100%);
    margin-inline: auto;
  }

  .field {
    display: grid;
    gap: var(--space-1);
  }

  .label {
    color: var(--text-muted);
    font-size: 0.75rem;
    letter-spacing: 0.06em;
    text-transform: uppercase;
  }

  .code,
  .code-row .code {
    width: 100%;
    padding: var(--space-2);
    border: 1px solid var(--frame-rule);
    border-radius: var(--radius-md);
    background: var(--surface-sunken);
    color: var(--text-primary);
    font-family: monospace;
    font-size: 0.7rem;
    line-height: 1.4;
    overflow-wrap: break-word;
    resize: none;

    /* stylelint-disable-next-line property-no-vendor-prefix -- iOS Safari still needs it */
    -webkit-user-select: text;
    user-select: text;
  }

  .code-row {
    display: grid;
    gap: var(--space-2);
  }

  .body {
    margin: 0;
    color: var(--text-muted);
    font-size: 0.9rem;
    text-align: center;
  }

  .error {
    margin: 0;
    color: var(--danger);
    font-size: 0.8rem;
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

  .action--go {
    border-color: var(--frame-rule-strong);
    color: var(--text-gold);
  }

  .action:disabled {
    opacity: 0.4;
    cursor: default;
  }
</style>
