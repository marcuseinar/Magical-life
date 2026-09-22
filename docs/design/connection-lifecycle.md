# The connection lifecycle — staying connected, and being honest when you aren't

A table today connects well and recovers from nothing. Every screen that shows
a connection shows it as a fact established once, at the moment of the
handshake, and never revisited. This document is the design for the other
nine-tenths of an evening: the app being closed and reopened, a phone sleeping
in a pocket, a host walking out of WiFi range, somebody going home at eleven.

The structural decisions are recorded in
[ADR 0007](../adr/0007-connection-lifecycle.md). This is the detail: the exact
failure being fixed, the state machines, what each device remembers between
launches, what every screen says in each state, and the order to build it in.

## The bug this starts from

> I connected to a game with a friend and then closed and opened the PWA. The
> friend got disconnected, I don't see the connected badge anymore, but in the
> table menu the friend is still joined.

Traced through the code, that is six separate things going wrong at once, and
only the last one is cosmetic.

1. **The host's table dies with the tab.** `TableHost`'s poll loop
   (`src/lib/tableConnection.svelte.ts`) is a running async function and the
   code it holds is a JavaScript variable. Closing the app ends both. The
   Durable Object keeps the room alive for another ten minutes, but nothing on
   earth can reach it any more, because the only copy of the code went with the
   tab.
2. **The friend is dropped and has nowhere to go.** Their `RTCDataChannel`
   closes, `linkState` flips to `'lost'`, and that is the end of the feature:
   nothing retries, and their game is in `createMemoryEventLog` — a reload
   would lose it outright.
3. **The host comes back with a different table.** `session.open()` on the
   fresh page has no memory of the old room, so it calls `openTable` and gets a
   _new_ code. Anyone still holding the old one is holding a dead string.
4. **The claim outlives the connection.** `seat/claimed` is in the event log
   and the log is on disk, so after hydration `player.claimed` is `true` for a
   device that is no longer anywhere. Nothing ever writes `seat/released`
   except "Drop this table".
5. **So the seat is bricked.** `localSeats` gives the host only the _unclaimed_
   seats; `GameScreen` then renders `boardPlayers = localList` and hands
   `PlayerPanel` a `readOnly` flag for everything else. The friend's seat is
   not merely mislabelled — it is off the board, and the host cannot change
   its life total at all. The one thing a life counter must always be able to
   do, it cannot do, for a player who is sitting right there.
6. **And the badge vanishes rather than going red.** `linkState` is `null`
   when no transport has ever been tracked, which is precisely the state a
   freshly-launched page is in. `null` renders nothing. So the app says
   "joined" and "" where the truth is "member, not present".

One root cause under all six: **the app has exactly one idea of a connection —
a live `Transport` object — and it uses that object's existence as the answer
to three different questions.**

## Three facts, kept apart

| Fact             | Means                                      | Lives in                                 | Survives a relaunch        | Who knows it                        |
| ---------------- | ------------------------------------------ | ---------------------------------------- | -------------------------- | ----------------------------------- |
| **Membership**   | this seat belongs to somebody's device     | the event log (`seat/claimed`)           | yes, by design             | everyone                            |
| **Presence**     | that device is talking to me right now     | transport state, device-local            | no, by definition          | the host, per seat                  |
| **Reachability** | there is a way back in — a code that works | the signalling room, plus a note on disk | yes, once we write it down | the host; the joiner holds its half |

`docs/design/shell-and-lobby.md` already argued the first two apart and called
conflating them "the classic bug — a member vanishing from the list because
their phone slept". We shipped the mirror image of that bug instead: a member
_staying_ in the list, dressed as a live connection, because the log said so.

The third row is the one nothing has ever written down, and it is what makes
automatic reconnection possible at all.

## Five rules

Everything below follows from these. They are worth stating separately because
each one rules out a tempting shortcut.

1. **Membership changes only when a person decides.** A dropped connection
   never writes `seat/released`. Somebody leaving writes it, and a host freeing
   an absent seat writes it. Nothing else, ever — presence is noisy and the log
   is forever.
2. **Presence never writes to the log.** It is derived from transports, kept in
   the store, and thrown away on reload. If it were an event it would replay as
   truth on a rejoin, when it is stale by definition.
3. **The code is a name for the table, not for the app session.** A host that
   closes and reopens the app comes back to the _same_ code. This is the single
   highest-value change here: it makes every joiner's own reconnection work
   unattended, because the thing they saved still points at something.
4. **Reconnecting is joining again.** No new mechanism. `claimOffer` →
   `answer` → seed → `merge` is already idempotent from end to end: merge is
   set union over `EventId`, and `claimSeat` on an already-claimed seat is a
   deliberate no-op. The only reason rejoining is not already reconnecting is
   that `joinTableAsSeat` _creates_ the store instead of being handed one.
5. **Every connection state is on screen, and holds its own box.** There is no
   state in the machines below that renders as nothing. `null` meaning "never
   connected" and also "not connected right now" is what made the badge
   disappear; rule 11 in `CLAUDE.md` does the rest.

## The state machines

### A. The table, on the host's device

```
  launch, holding a saved table ────────────────────────────► reconnecting

  none ──open()──► opening ──gets a code──► live ──Drop this table──► none
                      │                      │
            no worker │                      │ contact lost
                      ▼                      ▼
                 unreachable            reconnecting ──resumed, same code──► live
                 (the QR path)               │
                                             │ 60 s of failure
                                             ▼
                                          closed ──Reopen──► opening
```

- `none` — solo play. **Nothing has touched the network**, which is the
  property ADR 0006 bought and this design does not spend. A table opens when
  somebody asks for one, or when a saved one is found on launch; never
  otherwise.
- `opening` — a round trip. Dots in the code's box, and the button underneath
  says what it is waiting for (rule 11).
- `live` — there is a code, and the heartbeat is holding it open.
- `reconnecting` — we had a code and lost contact with it, which is also the
  state a relaunch starts in. Retried on a backoff, silently, because this is
  the case that should heal without anybody noticing.
- `closed` — retries gave up. The sheet offers **Reopen table**, which mints a
  code and is the manual fallback the automatic path is allowed to fail into.
- `unreachable` — no worker at all: offline, blocked, not deployed. Falls
  through to the no-server QR path exactly as `TableSheet` already does. This
  behaviour is right and stays untouched.

### B. One seat, on the host's device

Presence per seat, which is the mechanism the whole honest-lobby idea rests on.

```
  open ──someone claims it──► joining ──channel opens──► here
   ▲                                                      │  ▲
   │                                     transport closed │  │ reconnected
   │                                                      ▼  │
   │                                                  reconnecting
   │                                                      │
   │                                20 s with no contact  ▼
   └───── the host frees it, or the player leaves ─────── away
```

Leaving is available from `here` too, and is the player's own control rather
than the host's; the line above only shows where the two meet.

`reconnecting` exists so that a phone locking, a tab backgrounding, or one bad
ICE moment does not put the word "Away" and a destructive button in front of
the host twenty seconds too early. Twenty seconds of "Reconnecting…" costs
nothing and covers almost every real blip.

### C. The link, on a joiner's device

A joiner has exactly one connection — to the host — so this is the whole of
their connection model.

```
   joining ──seeded──► live ──transport closed──► reconnecting
      │                 ▲                             │
      │                 └──────claim + answer─────────┘
      │                                               │ 10 minutes
      ▼                                               ▼
   failed                                        unreachable
                                                  │        │
                                            Retry │        │ New code
                                                  ▼        ▼
                                           reconnecting   entry screen
```

`live ──Leave table──► gone`, from anywhere, at any time. Leaving is the only
transition here that writes to the log.

### D. Launch

```
  launch ─► hydrate the log
              │
              ├─ a joined table saved, and still current? ─yes─► restore it as
              │     the game on screen, link = reconnecting, retry in background
              │
              └─ no ─► the device's own game
                          │
                          └─ a hosted table saved, and this game still running?
                                ─yes─► reconnecting, in the background, no gate
                                ─no ──► none
```

Both resumes are background work behind a screen that is already usable. A
restored joined game renders from its own persisted log immediately; it does
not wait for the network to come back before showing the life totals.

## What each device writes down

Two small records, neither of them in the event log, both behind one new port
so `domain/` and `application/` stay ignorant of `localStorage`.

```ts
// src/application/ports/connectionStore.ts
export type HostedTable = {
  readonly code: string;
  /** Proves this device opened the room, so only it may rotate the offer. */
  readonly token: string;
  /** Which game the table belongs to, so a cleared history does not resume
   *  a table for a game that no longer exists. */
  readonly gameId: EventId;
  readonly openedAt: number;
};

export type JoinedTable = {
  readonly code: string;
  readonly seatId: PlayerId;
  /** The IndexedDB database holding this table's log — one per table, never
   *  the device's own. */
  readonly logName: string;
  readonly joinedAt: number;
};

export type ConnectionStore = {
  readHosted(): HostedTable | null;
  writeHosted(table: HostedTable): void;
  clearHosted(): void;
  readJoined(): JoinedTable | null;
  writeJoined(table: JoinedTable): void;
  clearJoined(): void;
};
```

Synchronous, because both records are a few hundred bytes and the launch path
cannot afford an async round trip before it knows which game to show — the
performance budget in `docs/architecture.md` is a requirement, not a
preference. `adapters/storage/localConnectionStore.ts` is `localStorage` with
a try/catch; a refused or full store degrades to "no saved table", which is
exactly today's behaviour.

`gameId` is the `EventId` of the current `game/started`. It answers "is this
saved table still about the game I am looking at?" without a second source of
truth: clear the history, start a genuinely new game, and the saved table no
longer matches and is not resumed.

### The joiner's log stops being in memory

`joinTableAsSeat` builds its store on `createMemoryEventLog` today, with a
comment that says exactly why and exactly what would change it:

> A per-table database is the real fix and is not hard, but it buys back a
> reload surviving a connection that cannot itself survive one yet.

The connection can survive one now, so the reason expires. `createIndexedDbEventLog`
takes a database name, joined tables use `magical-life-table-<code>`, and the
device's own game keeps `magical-life` untouched. Two rules keep this from
growing without bound: a joined log is deleted when its player leaves the
table, and on launch any joined database that is not the one saved record is
deleted too.

**Seed before you record.** `GameSession.nextSeq` derives the next sequence
number from the events already held for this author, so a device that records
an event into an _empty_ log and only afterwards merges its own older history
will mint an `EventId` that already exists with different contents — and
`orderEvents` dedupes by id, so one of the two silently wins. This is latent
today (a joiner's store does not exist until the seed has landed) and must stay
that way: a restored joined log is loaded from disk before anything is recorded
into it, and a rejoin with no log left seeds from the host first, exactly as a
first join does.

## What the screens say

The vocabulary is two words the whole way through, because there are two facts:
a seat is **Open** or it belongs to somebody, and a device is **Here** or
**Away**.

### The Table pill and the link chip

Today the pill counts claims and the chip reports a transport. They are the
same fact rendered twice and neither is presence. After this:

- **The pill is membership.** `Table 3` — three seats belong to somebody. It is
  the answer to "is everyone in yet?" and it does not flicker when a phone
  sleeps.
- **The chip is presence**, and it is rendered whenever this device is part of
  a table at all — which now includes a freshly-launched host with a saved
  table, the exact case where the badge used to disappear.

| Chip                    | Host means                              | Joiner means                      |
| ----------------------- | --------------------------------------- | --------------------------------- |
| `Table live`            | everyone who belongs is connected       | connected to the host             |
| `1 away`                | somebody who belongs is not connected   | —                                 |
| `Reconnecting…`         | the table itself is being reopened      | retrying the host                 |
| `Table closed`          | reconnecting gave up; Reopen is one tap | —                                 |
| `Can't reach the table` | —                                       | retries gave up; Retry is one tap |

`ConnectionChip`'s existing split stands: anything that is not working is
`role="alert"`, anything that is, is `role="status"`. The chip stops being
sticky. `lostLinks` was only honest while nothing reconnected — "something
already went wrong" is the right thing to say when it cannot be put right, and
the wrong thing to keep saying once it has been.

### The table sheet

The code, QR and link block is unchanged. The seat list grows one column and
one action:

```
┌ SEATS ─────────────────────────────────────────┐
│  Anna          You  │  Marcus         Here     │
│  Bo        Away ⌫   │  Seat 4         Open     │
└────────────────────────────────────────────────┘
   Away means their phone isn't talking to this
   one. They keep their seat until it's freed.
```

- The trailing slot is always there and always the same size, whether it holds
  a word or a button. Nothing jumps when Marcus's phone wakes up.
- `⌫` — **Free the seat** — appears only in `away`, never in `reconnecting`.
  It writes `seat/released` and nothing else; the seat becomes `Open` and can
  be taken by anyone, including the host, whose board gets it back immediately
  because `localSeats` gives a host every unclaimed seat.
- **Drop this table** stays, and stops being the only tool in the box. It is
  for ending a table, not for fixing one person.

Freeing one seat is what the roadmap already names as the natural next step
after the drop action — _"kicking one specific seat without dropping the whole
table is still unbuilt"_. It turns out to be the same control the absence
model needs, which is a good sign that this is the right seam.

### The joiner

- **Menu → Leave table.** Records `seat/released` for its own seat, sends it,
  closes the transport, clears the saved record and its log, and returns the
  device to its own game. This is the other half of "a player can stop being
  joined", and the half the player controls.
- While `reconnecting`, the game stays fully on screen and fully usable — a
  joiner can keep counting their own life while the host is in a lift. Their
  events queue in their own log and go out in the first batch after the
  handshake, because `connectTransport` sends whatever the peer has not been
  sent and a new transport has been sent nothing.
- At `unreachable`: **Retry**, and **Enter a new code** for the case where the
  host's table expired and had to be reopened under a different one.

### The host who was away

Nothing. A resume that works is silent — the code is the same code, the seats
are the same seats, and the only visible trace is the chip passing through
`Reconnecting…`. A resume that fails is one line and one button.

## Timings

| What                               | Value                           | Why                                                                                                                |
| ---------------------------------- | ------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `reconnecting` → `away` (a seat)   | 20 s                            | Covers a lock, a tab switch and one bad ICE moment without alarming anyone                                         |
| Joiner retry backoff               | 0.5, 1, 2, 4, 8, then 10 s      | Fast enough that a host's relaunch is a blink; slow enough to be free                                              |
| Joiner retry reset                 | on `visibilitychange` → visible | Reopening the app _is_ the retry signal; never make somebody wait out a backoff they can see                       |
| Joiner gives up                    | 10 min                          | The room's own TTL. Retrying past it is retrying a room that cannot exist                                          |
| Host resume gives up               | 60 s                            | Beyond that, say so and offer the button                                                                           |
| Host poll — sheet open             | 1.5 s                           | Unchanged                                                                                                          |
| Host poll — somebody away < 2 min  | 1.5 s                           | The reconnect window that matters, and the one that makes a five-joiner relaunch take seconds rather than a minute |
| Host poll — somebody away < 10 min | 5 s                             | Still trying, cheaply                                                                                              |
| Host poll — otherwise              | 15 s                            | Unchanged                                                                                                          |

The poll ladder is the one piece of tuning that earns its complexity. Because
only one handshake is in flight at a time (ADR 0006), a host relaunching with
five joiners reconnects them one per poll: at 15 s that is over a minute of
people staring at phones, and at 1.5 s it is invisible. The ladder also keeps
a host whose friend went home overnight from beating on the worker forty times
a minute until morning.

## The worker

Two changes, both small, both in `workers/signalling/`.

**A host token.** `createTable` mints one, returns it alongside the code, and
stores it on the record. `publishOffer` and `poll` require it. Today they
require nothing, which means anybody who can read a code off a table can
publish their own offer under it and collect the next joiner — a real hole,
closed here because the resume path needs a notion of "the device that opened
this" anyway.

**`POST /tables` accepts a preferred code.** The host asks for the code it had;
the room is created under that name if it is free, and a fresh random one
otherwise. Combined with `resume`, this is what makes rule 3 true across the
full range of outages:

| Gap                     | Room at the worker | What happens                                        |
| ----------------------- | ------------------ | --------------------------------------------------- |
| Seconds — a relaunch    | still live         | `resume` with the token; same code, same seats      |
| Under 10 min            | still live         | same                                                |
| Over 10 min             | expired and swept  | create with the preferred code; same code, new room |
| Over 10 min, code taken | someone else's     | a new code, and the sheet says the code changed     |

The last row is a 1-in-a-million collision on a four-character code that has to
land inside the same window, and it fails safely: a joiner's saved code resolves
to a stranger's table showing unfamiliar seat names, which is a thing to look
at and back out of, not a thing that corrupts a game.

`resume` returns `410 Gone` when the room expired and `403` when the token is
wrong, so the client can tell "make a new one under the same name" from "you
are not the host of this".

## Building it

Four PRs. Each is one reviewable idea and each leaves the app better than it
found it, which matters because stage 1 is the one with a worker deploy in it.

**Stage 0 — stop lying.** No network changes at all. Per-seat presence in the
store (`trackConnection(transport, seatId)`, a `Map<PlayerId, SeatLink>`),
the chip driven by it and no longer sticky, the chip rendered whenever the
device belongs to a table, seat rows with state and a **Free the seat** action,
**Leave table** on the joiner's menu. This alone fixes items 4, 5 and 6 of the
six — the host gets the bricked seat back and the badge tells the truth — and
it is the model the next two stages need in order to have anything to show.

**Stage 1 — the host comes back.** The `ConnectionStore` port and its
`localStorage` adapter; the host token and preferred-code endpoints in the
worker; `TableSession` saving its code and resuming it on launch; the poll
ladder; **Reopen table**. Fixes items 1 and 3. After this, a host relaunch is
survivable _provided the joiner is still running_ — their transport is dead, so
this stage on its own reconnects nobody, which is exactly why stage 2 follows
immediately.

**Stage 2 — the joiner comes back.** A per-table IndexedDB log; the joined
record; restore-on-launch; `joinTableAsSeat` refactored to accept an existing
store so that rejoining and reconnecting are one code path; the backoff policy
as a pure, clock-injected module in `application/`; **Retry** and **Enter a new
code**. Fixes item 2, and closes the loop: after this, the journey in the bug
report heals by itself.

**Stage 3 — the rest of the polish.** The chip distinguishing a relayed link
from a direct one, which `docs/design/multiplayer.md` has been carrying as a
deferred follow-up since path 3 landed and which this design's chip rewrite
makes nearly free. A "someone is behind" indicator using the `seq` gap
`docs/architecture.md` already describes. Presence for _other_ seats on a
joiner's screen, if anybody ever asks for it — it needs the wire format to
carry something that is not a `GameEvent`, and the hub topology means nobody
is missing information they could act on without it.

## How it is tested

Following `docs/testing.md`'s split, with the emphasis on the part that is
pure.

- **Unit, exhaustive.** The backoff policy (attempt → delay → give up) and the
  poll ladder (reasons → interval) are pure functions of a clock and a state,
  and every branch of both is worth pinning. The seat-presence map against a
  fake `Transport`, the way `gameStore.svelte.test.ts` already pins the
  aggregate.
- **Worker.** Token enforcement and the preferred-code path against the real
  Workers runtime, alongside the existing `roomLogic` unit tests — resume after
  expiry, resume with a wrong token, publish without one.
- **Component.** The seat row in all five states, queried by role and name; the
  chip in all five; the action slot holding its size across a transition, which
  is rule 11 and is the kind of thing only a test will keep true.
- **End to end.** The bug report itself, as a journey: two contexts, a claimed
  seat, `page.reload()` on the host — the cheapest honest stand-in for closing
  and reopening a PWA — then assert that the joiner's chip passes through
  `Reconnecting…`, that the host's code is unchanged, and that a life change
  made on either device while apart arrives on the other afterwards. That last
  assertion is the one that proves the merge, and it is the reason to spend an
  e2e test here rather than a unit test.

## Known limits

- **Two tabs, one host.** Both would resume the same table and fight over the
  offer rotation; the symptom is flaky joins, not a corrupted game. A
  `BroadcastChannel` lease — one tab holds the table, the others show "open in
  another tab" — is the cheap fix if anybody hits it.
- **A seat claimed twice.** `seat/claimed` records _that_ a seat is taken, not
  _by which device_. If a host frees an absent seat, hands it to somebody else,
  and the original phone then reconnects, both devices author events for that
  seat and the life total counts both taps. Leaving clears the saved record, so
  the common case cannot happen; the remaining case needs a device id on the
  claim, which is a domain-event change and is not worth making until it
  actually bites.
- **The relay does not reconnect on its own terms.** A dropped relay socket
  goes back through the signalling handshake like everything else, which is
  correct but is slower than reopening a WebSocket would be. Worth revisiting
  only if relayed tables turn out to be common.
