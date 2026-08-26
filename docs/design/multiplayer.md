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

A data-channel-only offer, measured across three runs of
`spikes/webrtc-handshake/`, lands at ~585 bytes raw and ~427 deflate-compressed
— under the original 600–900 byte estimate, and comfortably inside a QR code's
binary capacity at error correction level L. No codec trimming needed: creating
a data channel with no media tracks never puts audio/video lines in the SDP to
begin with. Two scans per joining player.

**Gathering ICE candidates before showing the code needs a timeout, not an
unqualified wait.** The spike found that when the STUN server never answers —
a blocked network, not only the sandbox it was run in — `iceGatheringState`
never reaches `complete` on its own, so a design that waits for it
unconditionally hangs forever with nothing on screen and no error. The fix:
gather for a bounded window (spiked at 1500 ms, unvalidated against a real
network — the sandbox that number came from cannot produce a real STUN round
trip to measure against) and proceed with whatever candidates exist. On a
shared table WiFi — the common case this app is for — that is typically just
the host candidates, gathered in well under 100 ms with no STUN round trip at
all, which the spike confirmed still opens a channel on its own.

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

## What is actually built today: manual-code join

The three paths above are the target shape. Before any of the QR or
Cloudflare signalling layers, there is a fourth, deliberately smaller path
already shipped: paste-a-code, with no server and no camera.

- The host taps **Connect a table**, picks which seat is joining, and the
  device runs `offerConnection()` (`src/adapters/transport/webRtcTransport.ts`)
  — the same non-trickle-ICE offer/answer mechanism the spike proved, now a
  typed `Transport` port adapter rather than spike code. The offer, plus the
  target seat's id and name, is base64-encoded (`src/ui/interaction/connectionCode.ts`)
  into one code meant to be copied and sent by hand — a text message, read
  aloud, whatever is easiest.
- The joiner opens `/join`, pastes it, and is shown which seat they are about
  to become before committing to anything (`whoIsThisFor`). Accepting runs
  `answerConnection`, encodes the answer the same way, and shows it as the
  reply to send back.
- The host pastes the reply and taps **Connect**. Once the data channel
  opens, the host sends its entire event history as the joiner's first batch
  — a joiner's "catch up" and an ordinary life change are the same mechanism,
  in `connectTransport` (`src/lib/tableConnection.svelte.ts`): whatever this
  device has that the peer does not yet have, goes out, forever, for as long
  as the connection lasts.
- The joiner's device runs its own local `GameStore`, seeded from that first
  batch and merged with `GameSession.merge` (ADR 0002's ownership model,
  already relied on to dedupe and total-order). Its `authorId` is the seat it
  claimed, not the fixed `'device'` id solo and shared-device play use — that
  is what keeps two devices' events from colliding.
- The joiner's copy is deliberately **in memory only**
  (`createMemoryEventLog`), not the shared `IndexedDbEventLog` the device's
  own solo game uses — that log is one fixed database, and a joined table's
  events landing in it would silently merge into whatever game was already
  there. A reload loses a joined table today; rejoining supplies a fresh full
  copy through the same mechanism as the first join. A per-table database is
  the real fix, tracked for when reconnection matters, not before.

Proven end to end in `tests/e2e/table-connection.spec.ts` with two real
independent browser contexts standing in for two phones: a life change made
on either device reaches the other, in both directions, over an actual
`RTCDataChannel` — not a one-time snapshot.

One non-obvious bug worth recording because it will recur in any future
transport-facing code: a Svelte `$effect` only takes a reactive dependency on
a value it actually _reads_ during a given run. `connectTransport`'s catch-up
effect used to check `transport.state` (a plain, non-reactive property)
before reading `store.events`, so its very first run — before the connection
was even up — returned early without ever reading `store.events`, and
therefore took no dependency on it. The initial sync still worked, because
`onStateChange` calls the same function directly once the channel opens. But
the effect itself never re-ran after that, so life changes made after the
initial sync silently stopped propagating. The fix is to always read
`store.events` first, before any early return, so the dependency is taken
regardless of connection state at the time.

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

The row shows **every candidate at once**, as equal columns spanning the card.
Nothing scrolls and nothing is hidden.

It did scroll, once, and it was wrong twice over. The card is 194 px wide at six
players and a 44 px chip needs 264 px for six of them, so two of the badges were
always off screen — and reaching them meant panning a row to find a badge you
could not see. Panning to locate a target is not aiming. Equal columns fit
because the badge is drawn _inside_ the column rather than sizing it: at six
players each column is about 29 px, and the circle drawn in it is smaller again.

The badges are round. A square chip eats the width its neighbours need for the
same visual weight, and the damage sheet already identifies people with a disc.

Only opponents appear. The row briefly listed every seat, on the reasoning that a
stolen commander still deals its owner's damage — and the table reported it as
noise straight away. Your own badge is one more thing to aim past mid-gesture,
for a case that needs somebody to have stolen your commander. The domain still
records self-damage faithfully; the sheet is where you correct it.

Eliminated opponents are left out too. A dead player's commander left the game
with them (rule 800.4a), so it cannot be the source of a _fresh_ point of
damage — offering one as a live option would be offering something that
cannot happen. That is a different question from correcting a total already
on the books, which is what the damage sheet is for, and it deliberately does
not filter by elimination: you may well need to add to a dead opponent's
total after the fact.

Each badge is the owner's mana pip rather than their seat number. Seat numbers
were tried first, because mana colour already means something else in Magic — but
the pip is standing in for a player portrait, which is what will identify a
player here eventually, and the damage sheet already identifies people that way.
A number would have to be unlearned twice.

That only works if no two seats share a colour, and they did: seats cycled the
five true colours, so Player 6 was another white and two badges in the row were
indistinguishable. All seven colours are now in play, which covers the six seats
a table can have.

### Aiming: absolute, not relative

**The badge chosen is the one under the finger.** Position is read from the row's
own box, not from how far the finger has travelled since the press.

Travel was the first design and it could not be aimed. The same point on screen
selected different players depending on where the drag began — and the player can
see the badges but cannot see the point they started from, so there is no way to
predict what a movement will do. Sizing that travel against the room available
made every candidate _reachable_ without making any of them _findable_: the
complaint that followed was that the interaction still felt wrong.

`blameSlot` is a pure function of position, row box, and count, with property
tests asserting that sweeping across the row visits every slot exactly once in
order, that the answer never depends on anything but position, and that a
rotated panel mirrors.

One guard: the row does not take over until the finger has moved sideways ten
pixels on purpose. Reading position absolutely from the moment of the press would
blame whoever happens to sit under the thumb — and a loss is pressed on the minus
zone, which on a crowded card is nowhere near the "nobody" badge. A straight drag
down therefore blames nobody, which an end-to-end test asserts.

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
