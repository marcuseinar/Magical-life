# Multiplayer — connecting players without a dedicated server

## What "no server" actually means

WebRTC gives you a direct data channel between two browsers. It does not give
you a way to find the other browser. Three separate things are often conflated:

| Piece          | What it does                                         | Can it be free?                 |
| -------------- | ---------------------------------------------------- | ------------------------------- |
| **STUN**       | Tells a peer its own public IP:port                  | Yes — public STUN servers exist |
| **Signalling** | Carries the offer/answer/ICE handshake between peers | Needs _something_               |
| **TURN**       | Relays traffic when direct connection fails          | Costs bandwidth                 |

So "connect through a STUN server" is not sufficient on its own — STUN answers
"where am I?", not "where is Anna?". Something must carry roughly 2–4 kB of
handshake between the two devices _once_. After that, the connection is direct
and no server is involved for the rest of the game.

## Three connection paths, in order of preference

### 1. QR handshake — genuinely zero infrastructure

Players at a Magic table are physically together, which is a huge advantage most
apps don't have. Use it:

- Host taps **Start table**. The device creates an offer, gathers ICE candidates
  with `iceCandidatePoolSize` set so the SDP is complete before display, strips
  the SDP down to the fields that matter, compresses it, and renders a QR code.
- Joiner scans it, produces an answer, and shows their own QR back.
- Host scans that. Channel open.

A complete offer SDP is around 1.5–4 kB. Trimmed (drop unused codecs — we carry
a data channel only, not audio or video) and deflate-compressed, it lands near
600–900 bytes, comfortably inside a QR code's binary capacity at error
correction level L. Two scans per joining player.

Honest downsides: two scans is more friction than a code, and it scales
awkwardly to a 4-player pod (the host scans three times). Mitigated by having
the host relay peers to each other once the first channel is up — only the host
does QR, and joiners two and three are introduced over the existing mesh.

**This path is offline-capable**, which matters: game shops have bad signal.

### 2. Short-code signalling — the default

A Cloudflare Worker plus one Durable Object per table.

- Host gets a 4-character room code (`XKCD`). It is a room key, not a secret.
- Peers POST their offer/answer blobs to the Durable Object, which holds them
  in memory and hands them to the other peer.
- The Durable Object is destroyed after the last peer connects, or after 10
  minutes of inactivity.

The server sees only opaque SDP blobs and never sees a single game event. Cost
is a handful of requests per game — inside a free tier by orders of magnitude.
Verify current Cloudflare free-tier limits before launch; they change.

### 3. Relay fallback — when the network is hostile

Coffee-shop and hotel WiFi with client isolation will defeat direct WebRTC. The
usual answer is TURN, which costs real bandwidth money.

Better answer for _this_ app: our payloads are tiny. A life change is under 200
bytes. So when WebRTC fails, fall back to relaying the **game events themselves**
through the same Durable Object over a WebSocket. That is a "dedicated server" in
the strict sense, but it is a few kilobytes per game and it only engages when the
preferred path is impossible.

Because `Transport` is a port (see `docs/architecture.md`), this is one more
adapter. The UI shows a small connection-quality chip — direct, relayed, or
offline — and nothing else in the app changes.

## Trust model

Be explicit, because P2P invites wishful thinking.

- **There is no authority.** Any peer can write any event about themselves. A
  malicious peer can claim 400 life.
- That is fine, and it is the right call. This app is a shared notepad for people
  sitting at one table looking at each other. The social layer is the enforcement
  layer, exactly as it is with dice and paper.
- What the app _does_ provide is **attribution**: every event names its author,
  and the log is visible to everyone. Cheating is not prevented, it is obvious.
- **Sanctioned play (Milestone 5) is different.** There, the server is authoritative
  for results submission, and P2P state is treated as a convenience input that a
  judge can override.
- Data channels are DTLS-encrypted end to end by WebRTC. The signalling server
  cannot read game state because it never receives any.

## Commander damage tracking

### The rules being modelled

- Commander starts at 40 life.
- 21 combat damage from a single commander eliminates you, tracked **per
  commander**, not per player.
- Partner and Background give a player two commanders; each tracks separately.
- Infect/poison: 10 counters is lethal in every format.

### Data shape

A three-dimensional but sparse relation: `(victim, dealer, commanderSlot) → total`.
Stored as `commander/damaged` events; derived into a matrix by `fold`.

```ts
type CommanderSlot = 0 | 1; // partner support
// derived: Map<`${victim}:${dealer}:${slot}`, number>
```

### The UI problem

The naive design — a 4×4 grid on every panel — is 12 tap targets of noise for a
number that changes maybe five times a game. It also scales terribly to six
players. So: **it is not on the main screen.**

Instead, the counter tray shows a single **crown chip** on your panel, and it
only appears once you have taken commander damage at all. It reads `♛ 14` — your
highest incoming total, in the danger colour above 17. Tapping it opens a sheet:

```
  Commander damage to Anna
  ┌──────────────────────────────────┐
  │  Björn · Atraxa        14   − +  │  ← amber at 14
  │  Cara  · Kess           7   − +  │
  │  Dan   · Tymna          0   − +  │  ← partner, two rows
  │  Dan   · Thrasios       3   − +  │
  └──────────────────────────────────┘
```

One row per opposing commander, sorted by damage descending so the threat you
care about is at the top. Rows appear only for opponents in the current game, so
the sheet is exactly as long as it needs to be.

### Picking who dealt it

Two axes of one gesture. Dragging **down** sets how much life was lost; dragging
**sideways** moves along the list of who dealt it, one seat per 44 px, starting
from "nobody in particular". Both are measured from the press point, so dragging
back always undoes exactly — the same rule the life scrub follows. Release
commits both numbers together.

Tapping works too: the strip is a row of real buttons.

Three things the first attempt got wrong, all reported from a real game:

- **Too small to hit.** They were 20 px mana pips. Now 44 px chips.
- **They read as disabled.** Unselected sat at 55% opacity, which says "broken"
  rather than "not chosen". Now full contrast, with the selection filled.
- **Mana symbols were the wrong signal.** A player's identity colour looked like
  it meant the _colour of the damage_, which is a thing Magic already has an
  opinion about. Seat numbers instead — unambiguous, and they match the seating.

The strip drops in from **above the top edge** of the card and stays there. The
gesture that opens it is a downward drag, which puts the hand over the bottom of
the card — so the bottom is the one place these must not be.

At six players the card is 248 px tall: the strip needs 67 and the life total 53,
which leaves no room for a separate floating badge above the number it would
cover. So while the strip is open the pending amount moves onto the caption line
— `−13 · Björn's commander` — which is also the control that cancels. Measured
rather than guessed, and asserted by a test at four and six players.

The strip and the life total sit in **separate grid rows**, not as two boxes
floating over the same space kept apart by a margin.

That margin was the whole problem. It was six pixels on Chromium and negative on
WebKit, whose font metrics differ, and two attempts to widen it by measurement
both failed there. A row each makes overlap geometrically impossible in any
engine, with nothing left to measure.

Three CI cycles were spent on that because the sandbox was believed not to be
able to run WebKit. It can: the browser downloads fine and only the system
libraries are missing, which `npx playwright install-deps webkit` supplies. Run
that before reasoning about engine-specific layout — a guess verified only in CI
costs four minutes a try and is how the same test failed three times running.

The row collapses when nothing is pending, so the resting layout is unchanged.

The strip is one horizontally scrolling row, never wrapping. Wrapping put three
rows of chips over the life total at six players and the caption over the name
plate; a fixed-height row cannot. The selected chip is scrolled into view as the
drag moves through the list, and an end-to-end test asserts the strip clears both
the total and the plate at four and six players.

Only opponents appear. The row briefly listed every seat, on the reasoning that a
stolen commander still deals its owner's damage — and the table reported it as
noise straight away. Your own chip is one more thing to aim past mid-gesture, for
a case that needs somebody to have stolen your commander. The domain still
records self-damage faithfully; the sheet is where you correct it.

Each chip is the owner's mana pip rather than their seat number. Seat numbers
were tried first, because mana colour already means something else in Magic — but
the pip is standing in for a player portrait, which is what will identify a
player here eventually, and the damage sheet already identifies people that way.
A number would have to be unlearned twice.

### Reaching the far end of the row

One place along the row is a fixed 44 px of sideways travel — until the row is
longer than the card, which is exactly when it matters. Six players needed 264 px
of travel inside a 248 px card, so the last seats could not be reached by the
gesture at all: the table found this as "I can't scroll to player 6".

The step is now measured against the room the finger actually has, from the press
point to the far edge of the card, capped at 44 px when there is room to spare.
Sideways distance is unsigned, because a loss is usually pressed on the minus
zone and dragged right, but a scrub down from the plus zone starts on the other
side of the card and has to work too.

There is deliberately no minimum step. A floor and a guarantee that every
candidate is reachable are the same trade made twice — any floor above
`room / gaps` puts the far end out of reach again, which is the bug. In practice
it costs nothing: the room is never less than half a card, so six seats on a
320 px screen still leave 14 px a step. `blameStepPx` is a pure function with a
property test asserting that every candidate is reachable and none is skipped.

The row is also pannable by hand (`touch-action: pan-x`) once it outruns the
card. Rule 10 says nothing scrolls; this is the local opt-in that rule allows,
and the row is the one element in the app whose length is set by the size of the
table rather than the size of the screen.

### The flow that actually happens at a table

The important insight: **commander damage is nearly always life loss too.** So
don't make the player enter it twice.

When a player takes life loss in a Commander game, the delta badge grows a small
inline attribution row while it is pending:

```
        Anna
        27
       [−13]   ← pending badge
   ⟨ from: — · Björn · Cara · Dan ⟩   ← optional, one tap
```

Tapping an opponent tags the pending delta as commander damage from that player.
On commit, one gesture writes **both** the `life/changed` and the
`commander/damaged` event with the same total. If they tap nothing, it commits
as plain life loss. Zero extra taps for the common case, one extra tap for the
commander case, and the two numbers can never drift apart.

For the rare case where they do differ (a commander with lifelink hitting a
planeswalker, damage prevention, split damage), the sheet's `− +` steppers
remain as the manual override.

### Elimination

The reducer decides, not the UI. `isEliminated(player)` is true when life ≤ 0,
or poison ≥ 10, or any single commander total ≥ 21. When it flips, the panel
offers "eliminated" rather than doing it automatically — players routinely sit at
0 life for a moment while a replacement effect resolves, and an app that
declares them dead is wrong and annoying.

## The shared log

Worth building, and cheap, because the log _is_ the storage format — there is no
extra persistence work, only a view.

It earns its place in three ways:

- **Dispute resolution.** "Wait, when did I go to 12?" is a real, frequent
  question, and the app is the only participant with a perfect memory.
- **Reconnection.** A peer that drops and rejoins needs a diff, which is the log.
- **Post-game.** Turn count, damage sources, elimination order — the material for
  a league's statistics later.

Presented as a reverse-chronological list, grouped by turn once turn tracking
exists, collapsed by default behind a swipe-up handle. Entries are plain
language: "Anna −13 from Björn (Atraxa)". Each entry has a long-press "retract",
which writes an `event/retracted` event — history is never rewritten.
