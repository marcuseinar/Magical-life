<script lang="ts">
  import { page } from '$app/state';
  import {
    joinTable,
    joinTableByCode,
    whoIsThisFor,
    whoIsThisForCode
  } from '$lib/tableConnection.svelte';
  import type { Invitation, TableJoin, TableJoinByCode } from '$lib/tableConnection.svelte';
  import type { OfferPayload } from '$application/ports/signalling';
  import { defaultSignalling } from '$lib/signalling';
  import GameScreen from '../GameScreen.svelte';

  const signalling = defaultSignalling();

  type Stage =
    | { readonly kind: 'entry'; readonly manual: boolean }
    | { readonly kind: 'looking-up' }
    | { readonly kind: 'code-not-found' }
    | {
        readonly kind: 'confirm-code';
        readonly invitation: Invitation;
        readonly code: string;
        readonly offer: OfferPayload;
      }
    | {
        readonly kind: 'confirm-manual';
        readonly invitation: Invitation;
        readonly draftCode: string;
      }
    | { readonly kind: 'connecting-code'; readonly invitation: Invitation }
    | { readonly kind: 'connecting-manual'; readonly invitation: Invitation }
    | { readonly kind: 'playing' };

  let stage = $state<Stage>({ kind: 'entry', manual: false });
  let shortCodeDraft = $state('');
  let manualDraft = $state('');
  let manualError = $state(false);
  let joinedCode = $state<TableJoinByCode | null>(null);
  let joinedManual = $state<TableJoin | null>(null);
  let copied = $state(false);
  let triedLinkCode = false;

  async function lookUpShortCode(code: string) {
    if (code === '') return;
    stage = { kind: 'looking-up' };
    let result;
    try {
      result = await whoIsThisForCode(code, signalling);
    } catch {
      result = null;
    }
    if (result === null) {
      stage = { kind: 'code-not-found' };
      return;
    }
    stage = { kind: 'confirm-code', invitation: result.invitation, code, offer: result.offer };
  }

  // A code arriving in the link (scanned or tapped) skips straight to
  // looking it up — that is the entire point of sending a link instead of a
  // code someone has to type. `triedLinkCode` guards against re-triggering
  // every time `stage` changes back through `entry` on its way elsewhere.
  $effect(() => {
    const codeFromLink = page.url.searchParams.get('code');
    if (codeFromLink !== null && !triedLinkCode) {
      triedLinkCode = true;
      void lookUpShortCode(codeFromLink.trim().toUpperCase());
    }
  });

  function submitShortCode(event: SubmitEvent) {
    event.preventDefault();
    void lookUpShortCode(shortCodeDraft.trim().toUpperCase());
  }

  function readManualCode() {
    const invitation = whoIsThisFor(manualDraft);
    if (invitation === null) {
      manualError = true;
      return;
    }
    manualError = false;
    stage = { kind: 'confirm-manual', invitation, draftCode: manualDraft };
  }

  function beginJoinCode() {
    if (stage.kind !== 'confirm-code') return;
    joinedCode = joinTableByCode(stage.code, stage.offer, signalling);
    stage = { kind: 'connecting-code', invitation: stage.invitation };
  }

  function beginJoinManual() {
    if (stage.kind !== 'confirm-manual') return;
    joinedManual = joinTable(stage.draftCode);
    stage = { kind: 'connecting-manual', invitation: stage.invitation };
  }

  function useManualEntry() {
    manualError = false;
    stage = { kind: 'entry', manual: true };
  }

  async function copyReply() {
    const reply = joinedManual?.reply;
    if (reply === null || reply === undefined) return;
    try {
      await navigator.clipboard.writeText(reply);
      copied = true;
    } catch {
      // The reply field beneath the button is still selectable by hand.
    }
  }

  $effect(() => {
    if (stage.kind === 'connecting-code' && joinedCode?.store !== null) stage = { kind: 'playing' };
  });
  $effect(() => {
    if (stage.kind === 'connecting-manual' && joinedManual?.store !== null) {
      stage = { kind: 'playing' };
    }
  });

  const playingStore = $derived(joinedCode?.store ?? joinedManual?.store ?? null);
</script>

<svelte:head>
  <title>Join a table — Magical Life</title>
</svelte:head>

{#if stage.kind === 'playing' && playingStore}
  <GameScreen store={playingStore} />
{:else}
  <main class="join">
    <header class="masthead">
      <h1 class="title">Join a table</h1>
      <p class="tagline">Type the short code the host gave you, or open the link they sent.</p>
    </header>

    {#if stage.kind === 'entry' && !stage.manual}
      <form class="group" onsubmit={submitShortCode}>
        <label class="field">
          <span class="label">Short code</span>
          <input
            bind:value={shortCodeDraft}
            class="short-code-input"
            type="text"
            autocomplete="off"
            autocapitalize="characters"
            spellcheck="false"
            placeholder="XKCD"
            maxlength="8"
          />
        </label>
        <button class="action action--go" type="submit" disabled={shortCodeDraft.trim() === ''}>
          Continue
        </button>
      </form>
      <button class="fallback" type="button" onclick={useManualEntry}>
        Have a code to paste instead?
      </button>
    {:else if stage.kind === 'entry' && stage.manual}
      <form
        class="group"
        onsubmit={(event) => {
          event.preventDefault();
          readManualCode();
        }}
      >
        <label class="field">
          <span class="label">Their code</span>
          <textarea
            bind:value={manualDraft}
            class="code"
            rows="4"
            autocomplete="off"
            spellcheck="false"
            placeholder="Paste it here"></textarea>
        </label>
        {#if manualError}
          <p class="error" role="alert">
            That did not look like an invite code. Check it was copied in full.
          </p>
        {/if}
        <button class="action action--go" type="submit" disabled={manualDraft.trim() === ''}>
          Continue
        </button>
      </form>
      <button
        class="fallback"
        type="button"
        onclick={() => (stage = { kind: 'entry', manual: false })}
      >
        Have a short code instead?
      </button>
    {:else if stage.kind === 'looking-up'}
      <p class="body" role="status">Looking for that table…</p>
    {:else if stage.kind === 'code-not-found'}
      <div class="group">
        <p class="body" role="alert">
          That code wasn't found — it may have expired, or been mistyped.
        </p>
        <button
          class="action action--go"
          type="button"
          onclick={() => (stage = { kind: 'entry', manual: false })}
        >
          Try again
        </button>
      </div>
    {:else if stage.kind === 'confirm-code'}
      <div class="group">
        <p class="body">Join as <strong>{stage.invitation.playerName}</strong>?</p>
        <button class="action action--go" type="button" onclick={beginJoinCode}>Join</button>
      </div>
    {:else if stage.kind === 'confirm-manual'}
      <div class="group">
        <p class="body">Join as <strong>{stage.invitation.playerName}</strong>?</p>
        <button class="action action--go" type="button" onclick={beginJoinManual}>Join</button>
      </div>
    {:else if stage.kind === 'connecting-code'}
      <p class="body" role="status">Connecting…</p>
    {:else if stage.kind === 'connecting-manual' && joinedManual}
      <div class="group">
        <p class="body">
          Send this back to {stage.invitation.playerName} — whoever invited you.
        </p>
        {#if joinedManual.reply === null}
          <p class="body" role="status">Preparing a reply…</p>
        {:else}
          <div class="code-row">
            <textarea class="code" readonly value={joinedManual.reply} rows="4"></textarea>
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

  .short-code-input {
    padding: var(--space-2);
    border: 1px solid var(--frame-rule);
    border-radius: var(--radius-md);
    background: var(--surface-sunken);
    color: var(--text-gold);
    font-family: var(--font-display);
    font-size: 1.6rem;
    letter-spacing: 0.3em;
    text-align: center;
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

  .fallback {
    margin-inline: auto;
    color: var(--text-muted);
    font-size: 0.75rem;
    text-align: center;
    text-decoration: underline;
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
