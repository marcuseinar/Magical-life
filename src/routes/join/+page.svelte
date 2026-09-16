<script lang="ts">
  import { page } from '$app/state';
  import { goto } from '$app/navigation';
  import { resolve } from '$app/paths';
  import {
    joinTable,
    joinTableAsSeat,
    lookUpTable,
    whoIsThisFor
  } from '$lib/tableConnection.svelte';
  import type { Invitation, TableJoin, TableJoinByCode } from '$lib/tableConnection.svelte';
  import type { SeatSummary, TableSummary } from '$application/ports/signalling';
  import { playerId } from '$domain/ids';
  import { defaultSignalling } from '$lib/signalling';
  import { loadQrScanSheet } from '$lib/scanner';
  import { readJoinTarget } from '$ui/interaction/joinTarget';
  import QrCode from '$ui/components/QrCode.svelte';
  import GameScreen from '../GameScreen.svelte';

  const signalling = defaultSignalling();

  type Stage =
    /* One screen showing every way in, rather than one way with the others
       behind "instead" links. Scanning in particular used to be two levels
       down, which is backwards: at a real table it is the best path there
       is, and ADR 0004 makes it path 1. */
    | { readonly kind: 'entry' }
    | { readonly kind: 'looking-up' }
    | { readonly kind: 'code-not-found' }
    /* One code serves the whole table, so the code alone cannot say who the
       joiner is — they pick a seat from the list it resolves to. */
    | {
        readonly kind: 'pick-a-seat';
        readonly code: string;
        readonly table: TableSummary;
      }
    | {
        readonly kind: 'confirm-manual';
        readonly invitation: Invitation;
        readonly draftCode: string;
      }
    | { readonly kind: 'connecting-code'; readonly invitation: Invitation }
    | { readonly kind: 'connecting-manual'; readonly invitation: Invitation }
    | { readonly kind: 'playing' };

  let stage = $state<Stage>({ kind: 'entry' });
  /** The paste field is revealed rather than a mode of its own: it is the
   *  last resort of the three, and hiding the other two behind it is what
   *  made scanning unreachable. */
  let pasting = $state(false);
  let shortCodeDraft = $state('');
  let manualDraft = $state('');
  let manualError = $state(false);
  let joinedCode = $state<TableJoinByCode | null>(null);
  let joinedManual = $state<TableJoin | null>(null);
  let copied = $state(false);
  let scanning = $state(false);
  let loadedScanner = $state<Awaited<ReturnType<typeof loadQrScanSheet>> | null>(null);
  let triedLinkCode = false;

  async function openScanner() {
    loadedScanner = await loadQrScanSheet();
    scanning = true;
  }

  async function lookUpShortCode(code: string) {
    if (code === '') return;
    stage = { kind: 'looking-up' };
    let result;
    try {
      result = await lookUpTable(code, signalling);
    } catch {
      result = null;
    }
    if (result === null) {
      stage = { kind: 'code-not-found' };
      return;
    }
    stage = { kind: 'pick-a-seat', code, table: result };
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

  /*
   * A camera cannot tell the host's two QR codes apart, so this does: the
   * short-code path shows a QR of a join *link*, the no-server path a QR of
   * the offer itself. Sending a scanned link through the offer decoder is
   * what would have made the most likely QR at a real table report "that did
   * not look like an invite code".
   */
  function scanned(text: string) {
    scanning = false;
    const target = readJoinTarget(text);
    if (target === null) return;
    if (target.kind === 'short-code') {
      shortCodeDraft = target.code;
      void lookUpShortCode(target.code);
      return;
    }
    pasting = true;
    manualDraft = target.code;
    readManualCode();
  }

  /*
   * The table fills up while somebody is still deciding, so the list they
   * are deciding from has to keep up. Cheap: one small read every couple of
   * seconds, and only while the picker is actually on screen.
   */
  const SEAT_REFRESH_MS = 2000;

  $effect(() => {
    if (stage.kind !== 'pick-a-seat') return;
    const code = stage.code;

    const timer = setInterval(() => {
      void lookUpTable(code, signalling)
        .then((table) => {
          if (table !== null && stage.kind === 'pick-a-seat') stage = { ...stage, table };
        })
        .catch(() => {
          // A refresh that fails changes nothing; the list on screen is
          // still the last one that worked, and picking still tries.
        });
    }, SEAT_REFRESH_MS);

    return () => clearInterval(timer);
  });

  function takeSeat(seat: SeatSummary) {
    if (stage.kind !== 'pick-a-seat') return;
    joinedCode = joinTableAsSeat(stage.code, playerId(seat.id), signalling);
    stage = {
      kind: 'connecting-code',
      invitation: { playerId: playerId(seat.id), playerName: seat.name }
    };
  }

  function beginJoinManual() {
    if (stage.kind !== 'confirm-manual') return;
    joinedManual = joinTable(stage.draftCode);
    stage = { kind: 'connecting-manual', invitation: stage.invitation };
  }

  function startOver() {
    manualError = false;
    pasting = false;
    stage = { kind: 'entry' };
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
      <p class="tagline">Scan the host's code, type the short one, or paste what they sent.</p>
    </header>

    {#if stage.kind === 'entry'}
      <!-- Equal billing, top to bottom by how often each is the right one:
           scan at a table, type a code read out over a phone, paste when
           there is no network at all. -->
      <button class="action scan" type="button" onclick={openScanner}>Scan a QR code</button>

      <p class="divider"><span>or</span></p>

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

      {#if pasting}
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
            Use this code
          </button>
        </form>
      {:else}
        <button class="fallback" type="button" onclick={() => (pasting = true)}>
          Paste a code instead
        </button>
      {/if}
    {:else if stage.kind === 'looking-up'}
      <p class="body" role="status">Looking for that table…</p>
    {:else if stage.kind === 'code-not-found'}
      <div class="group">
        <p class="body" role="alert">
          That code wasn't found — it may have expired, or been mistyped.
        </p>
        <button class="action action--go" type="button" onclick={startOver}>Try again</button>
      </div>
    {:else if stage.kind === 'pick-a-seat'}
      <div class="group">
        <p class="body">Which seat are you?</p>
        <ul class="seats">
          {#each stage.table.seats as seat (seat.id)}
            <li>
              <button
                class="row"
                type="button"
                disabled={seat.claimed}
                onclick={() => takeSeat(seat)}
              >
                {seat.claimed ? `${seat.name} — taken` : seat.name}
              </button>
            </li>
          {/each}
        </ul>
        {#if !stage.table.open}
          <!-- Only one handshake is in flight at a time, which is exactly
               what stops two people landing in the same seat. -->
          <p class="body" role="status">Somebody else is joining right now — this will wait.</p>
        {/if}
      </div>
    {:else if stage.kind === 'confirm-manual'}
      <div class="group">
        <p class="body">Join as <strong>{stage.invitation.playerName}</strong>?</p>
        <button class="action action--go" type="button" onclick={beginJoinManual}>Join</button>
      </div>
    {:else if stage.kind === 'connecting-code'}
      {#if joinedCode?.failed}
        <div class="group">
          <p class="body" role="alert">
            That seat could not be taken — somebody may have got there first.
          </p>
          <button class="action action--go" type="button" onclick={startOver}>Try again</button>
        </div>
      {:else}
        <p class="body" role="status">Joining as {stage.invitation.playerName}…</p>
      {/if}
    {:else if stage.kind === 'connecting-manual' && joinedManual}
      <div class="group">
        <p class="body">
          Send this back to {stage.invitation.playerName} — whoever invited you.
        </p>
        {#if joinedManual.reply === null}
          <p class="body" role="status">Preparing a reply…</p>
        {:else}
          <!-- Lets the host scan this back rather than type it, the same
               way their own offer reached this device (ADR 0004's path 1). -->
          <div class="qr-row">
            <QrCode value={joinedManual.reply} />
          </div>
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

    <!-- Until ADR 0005 this screen was a cliff: nothing on it led anywhere
         but forward, and the browser's own Back was the only way out. -->
    <button class="secondary" type="button" onclick={() => goto(resolve('/'))}>
      Back to your own game
    </button>
  </main>
{/if}

{#if scanning && loadedScanner}
  {@const QrScanSheet = loadedScanner.QrScanSheet}
  <QrScanSheet
    scanner={loadedScanner.scanner}
    title="Scan their code"
    body="Point the camera at the code they showed you."
    onscan={scanned}
    onclose={() => (scanning = false)}
  />
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

  .qr-row {
    display: flex;
    justify-content: center;
    padding: var(--space-2);
    border-radius: var(--radius-md);
    background: white;
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

  /* The one primary on the screen. Continue keeps the outline treatment:
     two identically-weighted gold pills is no hierarchy at all, and at a
     real table the camera is the best path there is. */
  .scan {
    width: min(26rem, 100%);
    min-height: 3.25rem;
    margin-inline: auto;
    border-color: var(--frame-rule-strong);
    background: linear-gradient(180deg, var(--surface-raised), var(--surface-sunken));
    color: var(--text-gold);
  }

  /* A rule with the word sitting in it, so the two are alternatives rather
     than a sequence of steps. */
  .divider {
    display: flex;
    gap: var(--space-3);
    align-items: center;
    width: min(26rem, 100%);
    margin: 0 auto;
    color: var(--text-faint);
    font-size: 0.75rem;
    letter-spacing: 0.16em;
    text-transform: uppercase;
  }

  .divider::before,
  .divider::after {
    flex: 1;
    height: 1px;
    background: var(--frame-rule);
    content: '';
  }

  /* "Paste a code instead" stays quiet below — it is a third way in, not a
     way out, and the hierarchy between them is the point. */
  .secondary {
    width: min(26rem, 100%);
    min-height: 3rem;

    /* Set apart from the ways in above it: this is how you leave, not a
       fourth option. */
    margin-block-start: var(--space-4);
    margin-inline: auto;
    border: 1px solid var(--frame-rule);
    border-radius: var(--radius-md);
    background: var(--surface-sunken);
    color: var(--text-muted);
    font-family: var(--font-display);
    font-size: 0.95rem;
    letter-spacing: 0.04em;
  }

  .seats {
    display: grid;
    gap: var(--space-2);
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .row {
    width: 100%;
    min-height: 2.75rem;
    padding: var(--space-2) var(--space-3);
    border: 1px solid var(--frame-rule);
    border-radius: var(--radius-md);
    background: var(--surface-sunken);
    color: var(--text-primary);
    text-align: left;
  }

  .row:disabled {
    color: var(--text-muted);
    opacity: 0.6;
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
