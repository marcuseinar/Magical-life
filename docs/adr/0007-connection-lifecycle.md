# ADR 0007 — Membership, presence, and coming back

- Status: Proposed
- Date: 2026-09-22

## Context

Connecting a table works. Staying connected does not exist.

Reported from a real phone: a host connected a friend, closed the PWA and
reopened it. The friend was dropped with no way back, the host's badge
disappeared entirely rather than going red, and the friend stayed listed as
"joined" — on a seat the host could no longer touch, because `localSeats`
hands a host only the seats nobody has claimed and `GameScreen` renders the
rest read-only on somebody else's device.

`docs/design/connection-lifecycle.md` traces that to six failures with one
cause: the app has a single idea of a connection — a live `Transport` object —
and uses its existence to answer three different questions. Whether a seat
belongs to somebody. Whether that somebody is reachable right now. And whether
there is any way back in at all.

The third question has never had an answer stored anywhere. `TableHost` holds
its code in a JavaScript variable and its heartbeat in a running async
function, so closing the tab destroys the only reference to a room the worker
will keep alive for another ten minutes. A joiner's whole game is in
`createMemoryEventLog`, so a reload loses it. Neither side can retry, because
neither side remembers what it would be retrying.

Three things are needed, in the order they were asked for: a host that restarts
should have the game reconnect by itself, with a manual path as the fallback; a
joiner that drops should be able to come back and resume; and a player should
be able to stop being joined without the host restarting the table.

## Options considered

**Drive membership from presence — release a seat when its connection drops.**
The smallest possible change, and it makes the lobby self-correcting. Rejected:
it puts an ephemeral fact into a durable append-only log, so a phone that slept
for thirty seconds writes history. It also replays as truth on a rejoin, when
it is stale by definition, and it deletes the one fact — this seat is Bo's —
that the group needs in order to put Bo back in it. `docs/design/shell-and-lobby.md`
called conflating the two lists the classic lobby bug and it was right.

**A persistent WebSocket per device to the Durable Object, replacing the
handshake.** Presence becomes free and instant, reconnection becomes the
socket's problem, and the "one handshake in flight" serialisation disappears.
Rejected: it makes the server permanently in the loop for every game, which is
exactly what ADR 0004 declined to build — the cost stops being a handful of
requests per game and starts scaling with duration, and the relay ceases to be
a last resort and becomes the architecture.

**Reconnect with a new pairing each time — the host shows a fresh code and
everybody rejoins.** Zero new state; the paths all exist today. Rejected as the
primary path: it makes the host's phone ringing, or a lift, into a social event
for four people. It stays as the fallback, which is the right place for it.

**Remember the table, keep the code stable, and separate the three facts in the
model and on screen.** Chosen.

## Decision

**Membership, presence and reachability are three facts and are stored
differently.** Membership is `seat/claimed` in the event log, durable, agreed
by everyone. Presence is transport state, device-local, per seat, never
written down. Reachability is a small record on disk naming the room this
device is part of.

**Membership changes only when a person decides.** A player leaves, or a host
frees a seat whose device is absent. A dropped connection never writes to the
log. The host acting for an absent seat is not a new authority — `releaseAllSeats`
already does it for the whole table — but it is now stated rather than implied:
**the host is the table's authority over seats whose device is not there.**

**The code is a name for the table, not for the app session.** A host persists
its code and a token proving it opened the room, resumes that room on launch,
and — if the room has expired — recreates it under the same code. A joiner's
saved code therefore keeps working across a host's relaunch, which is what lets
the joiner's own reconnection succeed with nobody being told anything.

**Reconnecting is joining again.** Claim an offer, answer it, seed, merge. Merge
is set union over `EventId` and `claimSeat` on a held seat is already a no-op,
so the existing join path is idempotent end to end. The only change needed is
that `joinTableAsSeat` accepts the store it should fill instead of creating one.

**A joined game is persisted, in its own database.** `magical-life-table-<code>`,
never the device's own `magical-life` log — which is the reason it was in
memory in the first place, and remains the reason to keep them apart. The log
is deleted when the player leaves.

**Resuming is automatic and silent; reopening is manual and one tap.** A host
with a saved table resumes it in the background on launch, with no gate in
front of the app. Solo play still touches nothing: the resume happens only when
there is a saved table whose game is still the one on screen.

**Every connection state renders.** The chip is driven by presence rather than
by whether a `Transport` object was ever constructed in this page's lifetime,
and it stops being sticky — "lost" was only honest while nothing could recover.

## Consequences

- The reported journey heals by itself. Host relaunches, resumes the same room,
  publishes an offer; the joiner's retry claims it and merges both sides'
  events. Visible trace: a few seconds of "Reconnecting…".
- A host can always play every seat that is not actively somebody else's, which
  is the correctness fix hiding inside the cosmetic one. A life counter that
  cannot change a life total has failed at its only job.
- The worker gains a host token. `publishOffer` and `poll` currently require
  nothing, so anyone who can read a code off a table can publish an offer under
  it and collect the next joiner. The resume path needs the notion of "the
  device that opened this" regardless, so the hole closes as a side effect.
- Two endpoints' worth of new surface (`resume`, and a preferred code on
  create), one new port (`ConnectionStore`), one parameter on the IndexedDB
  adapter. No new domain events, and no change to the reducer.
- The host polls faster while somebody who belongs is missing, on a ladder that
  decays. This is what makes a five-joiner relaunch take seconds rather than a
  minute, given ADR 0006's one-handshake-at-a-time rotation, and it keeps a
  table whose player went home from beating on the worker all night.
- Presence stays asymmetric: the host knows every seat, a joiner knows only its
  own link. The topology is a hub and broadcasting presence would mean putting
  something that is not a `GameEvent` on the wire. Nobody is missing
  information they could act on.
- A seat can still, in one narrow case, be claimed by two devices at once — the
  host frees an absent seat, gives it away, and the original phone returns.
  `seat/claimed` says a seat is taken, not by whom. Leaving clears the saved
  record so the common case cannot arise; the rest is a domain-event change
  held back until it bites.

## Revisit if

A device id on `seat/claimed` turns out to be needed — that is the one schema
change this design deliberately does not make, and the signal is somebody
reporting a life total that moved twice for one tap. Or if relayed tables
become common enough that reconnecting through a full signalling handshake,
rather than reopening the WebSocket, is the slow part of coming back.
