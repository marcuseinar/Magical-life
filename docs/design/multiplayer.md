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
