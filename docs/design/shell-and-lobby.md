# The shell and the lobby

How a player moves between setting a game up, playing it, and running a table —
and why "New game" is currently a one-way door.

The lifecycle half of this is a structural decision, recorded in
[ADR 0005](../adr/0005-navigation-and-game-lifecycle.md). This document is the
detail: what each screen is for, what the lobby shows, and the journeys the
whole thing has to serve.

## What is wrong today

Three separate faults that read as one bad flow.

### Navigation is derived from whether a game exists

`src/routes/+page.svelte` renders `NewGameSheet` when `store.state === null` and
`GameScreen` otherwise. There is no third thing it can render, so "show me
setup" and "there is no game" are the same condition. The only way to reach
setup is therefore to stop having a game.

That is exactly what the New game button does. `store.abandon()` calls
`session.reset()`, which calls `log.clear()` — the whole event log, wiped:

```
GameScreen  confirming = 'new-game'
  -> store.abandon()          src/lib/gameStore.svelte.ts:179
  -> session.reset()          src/application/gameSession.ts:87
  -> log.clear()              the entire history is gone
```

This is the only place in the app that destroys history. Everything else
appends — `rematch` writes a fresh `game/started` and leaves the finished game
in the log on purpose, and rule 4 of the working agreement says state is
derived and never mutated in place. One call breaks that, and it is the call
sitting behind a button labelled with the most ordinary phrase in the app.

So "there is no way to get back" is literally true: there is nothing to get
back to. The confirm dialog says "The current life totals will be cleared",
which undersells it — every game ever played on the device is cleared.

### The format buttons decide more than they admit

`GameConfig` is already `{ format, startingLife, tracksCommanderDamage }`. The
two fields that change how the app behaves are already first-class; `format` is
a label that happens to imply them. And `startGame` already accepts a
`startingLife?` override that nothing calls:

```ts
// src/application/usecases/startGame.ts
async (formatId: FormatId, requests: readonly SeatRequest[], startingLife?: number) =>
```

Meanwhile `maxPlayers` is enforced per format, so choosing "Brawl" silently caps
the table at four, and "Multiplayer" — the format with the most obviously
multiplayer name — caps at four while "Constructed" allows six. Nobody can
predict that from the button. The roadmap has listed a custom format as M1 work
since the beginning; it never shipped because there was no screen shaped to
hold it.

The comment on `twoHeadedGiant` in `src/domain/rules.ts` is the tell. It is a
paragraph apologising for a format whose name promised a mechanic the app does
not have. The fix for that class of problem is to stop naming mechanics and
start showing them.

### Connecting a table is a per-seat errand, not a room

`TableSheet` lists the seats; you tap one; you get one code for that one seat;
you watch that one invite's status. To seat three people you do the whole thing
three times, and at no point does any screen show you the table. The host
cannot answer "is everyone in yet?" without remembering who they have already
invited.

Underneath, that shape is real and not just cosmetic: `inviteToTableByCode`
creates one `offerConnection()` and one signalling room per seat, and the room
holds exactly one offer and one answer (`workers/signalling/src/roomLogic.ts`).
One code per seat is what the worker is built for.

The joiner's side is worse. `/join` has no way back to anything. There is no
leave, no rejoin, and a reload loses the game — the joined store is deliberately
in memory (`createMemoryEventLog`), for good reasons documented in
`docs/design/multiplayer.md`, but nothing on screen tells the player that the
back button is a cliff.

## What is already right, and should not be rebuilt

Worth stating plainly, because it makes the work much smaller than it looks.

- **Seat claims are already the membership model.** `seat/claimed` and
  `seat/released` are ordinary events; `player.claimed` is derived state;
  `localSeats`/`remoteSeats` already answer "which seats can this device play".
  A lobby's "who is in" is a view over state the domain already has. No new
  events.
- **`seat/released` exists and nothing uses it.** There is no `releaseSeat` use
  case and no UI. Half of "leave the table" is already in the domain.
- **A new game keeps the table.** `reduce` on `game/started` rebuilds the
  players from `claimsHeld(state)` (`src/domain/reducer.ts:57`), so claims
  survive a restart. A host can start a completely different game without
  everyone rejoining.
- **Late join already works.** `connectTransport` sends "everything this device
  has that the peer does not", forever. A joiner's first batch is the whole
  history because nothing has been sent yet — there is no separate catch-up
  path to build. Inviting someone on turn nine uses the same code as inviting
  them at setup.
- **Multiple games in one log already fold correctly.** `rematch` relies on it.

## The decisions

Three forks, decided:

| Fork                     | Decided                                      | Because                                                                                                                                                                   |
| ------------------------ | -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Where the lobby lives    | A screen reachable at any time, never a gate | Solo play must stay instant to start (rule 9). A lobby you pass through costs the 90% case to serve the 10%. And if it is never a phase, late join needs no special case. |
| What replaces formats    | Presets that prefill real settings           | Life, players and commander damage are the actual controls. Presets keep the one-tap "we're playing Commander" path without making it the only path.                      |
| How a joiner gets a seat | They pick a free one                         | It is `seat/claimed` with a person attached, and it is the only model where seat order can match where people are actually sitting.                                       |

## The shell

Navigation stops being derived from game state. Screens become routes, and the
store moves up to the layout.

```
src/routes/
  +layout.svelte      owns the one GameStore, provides it via $lib/context
  +page.svelte        the game
  setup/+page.svelte  new game settings  (was NewGameSheet)
  table/+page.svelte  the lobby          (was TableSheet)
  join/+page.svelte   joining            (exists; gains a way back)
  menu/+page.svelte   or a sheet — see below
```

Routes rather than an in-component screen stack, for three reasons that all
already apply:

- The back button works for free, on the web today and for Capacitor's
  hardware back button in M4, which the roadmap already lists as work.
- Each screen code-splits, which is how rule 8 stays true when M5 adds
  accounts: the auth bundle cannot reach a screen it is not imported by.
- `/join` is already a route. One mechanism, not two.

`$lib/context.ts` already exists for exactly this and is currently unused —
every route passes `store` as a prop instead. Hoisting the store to the layout
and providing it through context is the change that makes routing possible at
all, because a screen change must not unmount the game.

One wrinkle to design for: joining replaces the shell's store rather than
creating a second one. Today `/join` builds its own `GameStore` and renders its
own `GameScreen`. After the change there is one store slot at the layout, and
a successful join swaps what is in it.

### The toolbar

Today: `Undo · First · Rematch · New game`, plus a "Connect a table" link
underneath, and an e2e test asserting all four fit one row at phone width
(`tests/e2e/life-counter.spec.ts:256`).

Proposed, same count, same row:

```
  Undo  ·  First  ·  Table 3  ·  Menu
```

- **Table** replaces the buried link and carries a count of claimed seats, so
  "is everyone in?" is answerable at a glance without opening anything.
- **Menu** holds Rematch, New game, Settings, Leave table, and later the game
  log view the roadmap defers.

Rematch moving one tap deeper is a real cost — it is reached often, at the end
of every game. The answer is not to keep it in the toolbar but to surface it
where it is actually wanted: once the game has a winner, in the post-game
summary M2 already plans. Until then it lives in the menu, which is honest
about it being a once-per-game action rather than a mid-play one, the same
reasoning that already hides **First** once the opponent bar appears.

### The lifecycle, renamed

The core fix. Four actions, only one of which destroys anything:

| Action            | Mechanism                                                                                        | Reversible                                       |
| ----------------- | ------------------------------------------------------------------------------------------------ | ------------------------------------------------ |
| **Rematch**       | append `game/started`, same seats, same config                                                   | It is in the log                                 |
| **New game**      | go to `/setup` prefilled from the current game; Begin appends `game/started` with the new config | Back, until you tap Begin. Then it is in the log |
| **Leave table**   | drop transports, record `seat/released`                                                          | Rejoin                                           |
| **Clear history** | the only caller of `log.clear()` — in Settings, behind a confirm that says what it means         | No, and it says so                               |

`store.abandon()` stops calling `reset()`. New game becomes navigation, not
demolition. That single change answers "there is no way to get back", because
the game is still there while you are looking at setup — and the setup screen
gets a **Back to game** affordance that is only possible once the game survives
being looked away from.

`log.clear()` still needs to exist. An append-only log on a device grows
forever, and a player handing their phone to someone else has a real reason to
wipe it. It becomes a deliberate act in Settings rather than the side effect of
a button most people will read as "set up a different game".

## Setup: settings, not modes

```
┌ QUICK START ───────────────────────┐
│  [Commander]     [Constructed]     │
│  [Brawl]         [Multiplayer]     │
└────────────────────────────────────┘

  Starting life      −   40   +
  Players            −    4   +
  Commander damage      [ on ]

  ● ● ● ●                           (colour preview)

  [        Begin at 40        ]

  Join a table instead
```

Tapping a preset fills the three controls and highlights the chip. Touching any
control clears the highlight and the config becomes custom. The preset is a
shortcut into the settings, not a mode the settings live inside.

### What changes in the domain

Less than it looks, and less than this sketch expected:

```ts
// src/domain/rules.ts
export type PresetId = 'commander' | 'standard' | 'twoHeadedGiant' | 'brawl';
export type FormatId = PresetId | 'custom';
export const MAX_PLAYERS = 6;
```

Splitting `PresetId` out of `FormatId` is what makes `'custom'` unable to
appear where a preset is meant — the setup screen's quick-start row can only
offer things that exist. `GameConfig` already carries `startingLife`
and `tracksCommanderDamage`; `format` stays in it as the preset label, which
also keeps every already-saved game readable — the reason the `twoHeadedGiant`
id was kept when its name changed.

`startGame` takes the settings instead of deriving them:

```ts
export type GameSetup = {
  readonly startingLife: number;
  readonly tracksCommanderDamage: boolean;
  readonly preset: FormatId;   // 'custom' when the controls were touched
};

startGame(deps)(setup: GameSetup, seats: readonly SeatRequest[])
```

`FORMATS` stops being the source of truth for what a game is and becomes what
it always really was: a table of presets. `maxPlayers` goes with it — the cap
becomes one number for the app (6, what the panel layouts support), not a
per-format surprise.

### Settings inventory

In scope for this overhaul:

- Starting life (free number, presets at 20/25/30/40)
- Player count (1–6)
- Commander damage on/off

Deferred, and worth naming so the screen is designed with room for them:

- Naming players during setup — listed in the roadmap as M1 work deliberately
  deferred, and this screen is its natural home. Cheap to add; adds a second
  section and some vertical pressure against rule 10.
- Lethal poison and lethal commander-damage thresholds — real constants
  (`LETHAL_POISON`, `LETHAL_COMMANDER_DAMAGE`), currently fixed. Almost nobody
  changes them. Not worth the screen space yet.
- Which counters appear in the tray.
- Round clock — M8 model 1, which the roadmap says should ship on its own.

## The lobby

One screen. Reachable from the game's **Table** button, and from setup for a
host who already knows this is a table game.

```
┌─ THE TABLE ────────────────────────┐
│                                    │
│         ▛▀▜  ▛▀▜  ▛▀▜              │
│         ▙▄▟  QR   ▙▄▟              │
│                                    │
│            X K C D                 │
│                                    │
│   [ Copy link ]   [ Show QR ]      │
│                                    │
│  SEATS                             │
│  ● Anna       you          ·       │
│  ● Marcus     joined     direct    │
│  ○ Player 3   free      [Invite]   │
│  ○ Player 4   free      [Invite]   │
│                                    │
│  [ Done ]                          │
└────────────────────────────────────┘
```

Three things on one screen, which is the whole point: the code to say out loud,
the QR to hold up, the link to paste in a group chat — and beneath them, who is
actually in.

### "In" and "connected" are two different facts

Worth separating carefully, because the app can only honestly answer both for
one device.

**Membership** is `player.claimed` — durable, in the event log, agreed by
everyone, and it survives a rematch, a new game, and a dropped connection.
Every device can show it.

**Presence** is transport state — ephemeral, device-local. The topology is a
hub: every joiner holds exactly one transport, to the host. So the host knows
every seat's connection, and a joiner knows only its own link to the host.

The honest lobby therefore shows:

- On the host: membership for every seat, plus a live connection state per seat.
- On a joiner: membership for every seat, plus their own link to the table.

The alternative — broadcasting presence as events so everyone sees everyone —
puts ephemeral connection state in the durable game log, which is wrong twice
over: it is not part of the game's history, and it would replay as truth on a
rejoin when it is already stale.

### Per-seat connection state

This is the one genuinely new mechanism. `GameStore.linkState` is aggregate
today — two counters, `connectedLinks` and `lostLinks`, and one chip for the
whole table.

```ts
trackConnection(transport: Transport, seat: PlayerId): void
// keeps Map<PlayerId, 'connecting' | 'direct' | 'lost'>

get seatLinks(): ReadonlyMap<PlayerId, SeatLink>
get linkState(): 'direct' | 'lost' | null   // derived from the map; ConnectionChip unchanged
```

`ConnectionChip` keeps working untouched, because the aggregate becomes a
derivation of the map rather than a separate pair of counters. The lobby reuses
the same component per row, which is what makes the row read the same way as
the chip a player has already learned.

### One code for the table

**Built** — see [ADR 0006](../adr/0006-one-code-for-the-table.md), which
records the room shape and the trade-offs. What follows is the sketch it was
built from.

```
Host    createTable(seats)  ─────────> room XKCD, offer #1 published
Joiner  getTable('XKCD')    <───────── seat list + offer #1 + a ticket
Joiner  picks seat 3, answers ───────> submitAnswer('XKCD', ticket, answer)
Host    polls, sees it, accepts ─────> connected; publishes offer #2
                                       ...repeat
```

The compare-and-swap is what matters: the room hands the live offer to exactly
one claimant, so two people scanning at once cannot both answer the same SDP.
Everything past the exchange is unchanged — same `Transport`, same
`connectTransport`, same in-memory joiner store.

The trust model in ADR 0004 holds. The worker's room now carries seat names and
colours as well as SDP, so the joiner can be shown a seat list before
committing. It still never sees a life total or a game event.

Two things do change and need deciding when this is built:

- **Room TTL.** Ten minutes is right for a handshake and wrong for a lobby that
  stays open for a whole game so a fifth player can arrive on turn nine.
  Refreshing on host poll is the obvious fix; it also means a room dies shortly
  after the host stops caring, which is the behaviour you want.
- **Seat claim races.** Two people tapping Player 3 at the same moment is newly
  possible — the per-seat invite model made it impossible. Resolve it in the
  total order ADR 0002 already defines: first claim by lamport order, authorId
  as tiebreak, wins. The loser's device sees the seat go claimed by someone else
  and asks them to pick again. This deserves a domain test; `claimSeat` is
  currently a deliberate no-op on an already-claimed seat, which is right for a
  rejoin and wrong for a race, because it tells the loser they succeeded.

### Joining is a list, not a code

The code is _one way_ a table gets onto the joiner's screen, not the definition
of joining. Worth stating now, because the alternative framing — "type the code
to join" — is the one that makes every later discovery mechanism a rewrite
rather than an addition.

**Built**, as a list of _ways in_ rather than of tables — the tables themselves
need discovery, which is phase 4 and M4. `/join` is one screen showing all
three at once:

```
  JOIN A TABLE

  [      Scan a QR code      ]

  ──────────  or  ──────────

  Short code
  [  X K C D  ]
  [  Continue  ]

  Paste a code instead
  Back to your own game
```

What this replaced is the point. The old screen opened on the short code, hid
the paste field behind "Have a code to paste instead?", and hid _scanning_
behind that — two levels down from the entry screen. Scanning is the best path
there is at a physical table, and ADR 0004 makes it path 1; it was the hardest
thing on the screen to reach. Paste stays a disclosure because it genuinely is
the last resort, but it no longer stands between anyone and the camera.

Promoting the camera exposed a real gap. The host shows two different QR codes
depending on which path is live — a join _link_ on the short-code path, the
offer blob itself on the no-server one — and the scanner only understood the
second. So the most likely QR at a real table decoded to "that did not look
like an invite code". `readJoinTarget` (`src/ui/interaction/joinTarget.ts`)
classifies what was scanned; it only classifies, so a wrong guess costs a
clear "that code wasn't found" rather than a wrong screen.

Joining also reaches the menu, alongside Rematch and New game. It was
previously reachable only from setup's "Join a table instead" — which means
only from a device with no game of its own, so a player already counting their
life had no route to it at all. Joining does not disturb that game either: a
joined table keeps its own in-memory store, and Back to your own game returns
to it.

Three discovery sources are plausible later, none of them in scope here:

- **Bluetooth LE**, once there is a native shell (M4). Not before: Web
  Bluetooth is central-role only — a browser can scan for peripherals but
  cannot advertise as one, so two phones running the web app both scan and
  neither is findable. iOS Safari has no Web Bluetooth at all. This is a
  platform limit, not an effort one.
- **Same network**, via the signalling worker grouping rooms by the coarse
  network they were created from. Works on the web and on iOS today, needs no
  permission — but it is new metadata at the worker, which ADR 0004 was
  deliberate about, and it degrades exactly where it would be most useful: one
  venue NAT at an M5 event lists every table in the hall.
- **The code**, which already works, needs nothing, and stays the fallback that
  is always available when the others find nothing.

Deliberately _not_ a `Discovery` port today. Purity and a screen shaped like a
list are what keep this cheap; a plugin system for a milestone that has not
started is the speculative abstraction the working agreement warns about.

### Ship the screen before the signalling

The lobby _screen_ does not depend on any of that. Over today's per-seat
invites it shows the same seat list, the same per-seat connection state, and an
Invite button per row that opens the existing code — the only thing it cannot
show is a single table code. That is a real phase that ships something usable,
and it puts the screen in front of people before the worker changes underneath
it.

## Journeys

Written as what happens, not as features. The failure column is what the app
does today.

### J1 — Kitchen table, one phone

Anna opens the app, taps **Commander**, taps **Begin at 40**. Four panels.
Nobody connects anything.

_Must not regress._ This is the common case and the reason the lobby is not a
gate. Every change here is measured against whether this got slower.

### J2 — Four phones at the shop

Anna sets up Commander for four and begins. She taps **Table**, holds the phone
up, and the other three scan the QR. Each sees the table's seats, taps a free
one, types their name. Anna watches three rows go from _free_ to _joined ·
direct_. She taps Done and the game is already running.

_Today:_ Anna invites Marcus, waits, invites Ben, waits, invites Cara — three
sheets, three codes, and no screen that ever shows her all three.

### J3 — The fifth player arrives on turn nine

Dan shows up. Anna opens **Table**, taps **Add a seat**, holds up the QR. Dan
scans, takes seat 5, and his phone shows the game already in progress, with the
history it missed.

_Today:_ mechanically this already works — `connectTransport` sends the whole
log to a new peer regardless of when they arrive. What does not exist is adding
a seat to a running game. `game/started` fixes the player list; there is no
`seat/added` event. **This is the one journey that needs a new domain event**,
and it is worth confirming you want it before it is built.

### J4 — "We said 30, not 40"

Two minutes in, somebody notices. Anna opens **Menu → New game**. Setup opens
with the current settings already filled in. She changes life to 30 and taps
Begin. Fresh totals, same four people, same phones still connected.

_Today:_ New game erases the log, and everyone who joined has to rejoin — their
in-memory store is gone with the connection. After the change, claims survive
`game/started` (`reduce`, `claimsHeld`), so the table stays up.

### J5 — Marcus's phone dies

He plugs it in, reopens the app, and gets his own solo game — the joined one
was in memory. He taps **Join**, enters the code still on Anna's screen, and
picks his seat again. `claimSeat` no-ops on an already-claimed seat, so he lands
back where he was with the full history.

_Today:_ the rejoin path works, but the code he needs is a per-seat invite Anna
has to generate again, and `/join` has no way back if he mistypes it.

### J6 — Wrong game entirely

Anna sets up Constructed for two, then realises it is a Commander night. She
taps **Menu → New game**, changes the settings, begins. Or she taps back and
keeps the game she had.

_Today:_ this is the journey the whole first complaint is about. Setup is only
reachable by destroying everything.

### J7 — Someone playing remotely

Ben is not at the table. Anna taps **Copy link** and pastes it into the group
chat. Ben opens it on his laptop, picks a seat, and is in.

_Today:_ the link exists (`TableSheet` builds a `/join?code=` URL) but it is a
per-seat link Anna has to generate for a specific person, inside a sheet she
opened by tapping that person's row.

### J8 — The shop's WiFi is hostile

The worker is unreachable. The lobby says so plainly and offers the QR
handshake, which needs no network at all.

_Today:_ `TableSheet` already does exactly this, and does it well — it drops
into the manual path without making anyone read an error. **Keep this
behaviour.** It is the one part of the current flow that should survive the
overhaul unchanged.

### J9 — Marcus has to leave

He taps **Menu → Leave table**. His seat goes free in everyone's lobby; his
phone returns to its own game. Anna can hand the seat to someone else.

_Today:_ impossible. `seat/released` is defined in `src/domain/events.ts`, has
no use case, and no screen can send it.

## Patterns worth borrowing

You asked whether there are good patterns here. There are, and they are well
worn enough to just take.

**Room code with a rotating offer.** Jackbox, Kahoot, Among Us: one short
human-readable code for the room, not per participant. The code is a stable
name for the table; the offer behind it rotates as people take it. This is what
makes one QR serve four people.

**Membership and presence are separate lists.** Slack, Discord, every
multiplayer lobby: who belongs is durable, the green dot is not. Conflating
them is the classic bug — a member vanishing from the list because their phone
slept. Keeping `seat/claimed` durable and connection state ephemeral is the
same split.

**The lobby is a room, not a gate.** Older games make you assemble everyone and
press Start. Newer ones let you drop in and out, and the lobby stays open the
whole session. Drop-in is strictly more forgiving, and it is what makes J3 a
non-event rather than a feature.

**Optimistic claim, resolved by total order.** Let the joiner take the seat
immediately and reconcile if two people collide, rather than round-tripping to
ask permission. ADR 0002's ownership rule already defines the order to resolve
by, so this is applying an existing rule to a new case, not inventing one.

**Presets are entry points into settings, not alternatives to them.** Steam's
graphics presets, iOS Focus modes: tap Medium, then change the one thing you
care about, and the preset label quietly turns to Custom. Never a locked door.

**A destructive action should be rare, reversible, or loud — and never all of
cheap, final, and ordinary-sounding.** Today's New game is a two-tap
irreversible wipe behind the most ordinary phrase in the app. Making it append
means the confirm dialog can go away entirely; the one remaining destructive
action gets a name that says what it destroys.

## Sequencing

Split by reviewable idea, per the working agreement — not by file and not by
screen.

**Phase 1 — The shell and the lifecycle. Built.** The store moves to the layout
behind `$lib/context`; screens become routes; `abandon` becomes `clearHistory`;
New game becomes navigation; the toolbar becomes `Undo · First · Table · Menu`;
`/join` and `/setup` gain a way back. Clear history lands in Settings as the
only caller of `log.clear()`.

_Ships:_ the first complaint is fixed on its own, with no lobby yet.

One thing turned out to be load-bearing that this plan had not called for.
`startGame` mints a fresh id per seat, and `reduce` carries claims forward
_by seat id_ — so a new game over a running one would have renamed everyone
back to Player N and dropped every joined device, which is not what J4 asks
for at all. `SeatRequest` therefore gained an optional `id`: supplied when a
seat is being carried through, minted when it is genuinely new. One code
path, no flag, and it is what makes "we said 30, not 40" cost the life
totals and nothing else.

The menu's rows also put their hint outside the button. Inside, the hint
joined the button's accessible name — "Rematch Same players, fresh totals" —
and the name of an action should be the action; `aria-describedby` is how the
hint still reaches a screen reader.

**Phase 2 — Settings instead of modes. Built.** `'custom'` joins `FormatId`;
`FORMATS` becomes `PRESETS`; `maxPlayers` becomes one app-wide `MAX_PLAYERS`;
the setup screen gets the three controls.

`startGame` did not need a `GameSetup` type after all — it takes a
`GameConfig` directly. The config is already exactly what a game runs on, so
inventing a parallel shape would have been ceremony; the use case now mints
seat ids and records an event, and the application layer no longer imports the
preset table at all. Presets became purely a UI concern, which is what they
always were.

The risk this plan flagged did not materialise, and the reason is worth
keeping: `GameConfig` never changed shape. Starting life and commander damage
were always fields of their own and `format` only widened to admit one more
value, so a game recorded before the change folds to exactly what it folded to
before. `reducer.test.ts` now asserts that against a stored event written out
as bytes rather than built by current code, which is the only version of that
test worth having.

**Phase 3 — The lobby screen, over today's signalling.** Per-seat connection
state in the store; the lobby route; `releaseSeat` and Leave table. Still one
code per seat, shown per row.

_Ships:_ J2, J5, J7 and J9 all get materially better with no worker change.

**Phase 4 — One code for the table. Built**, and recorded in
[ADR 0006](../adr/0006-one-code-for-the-table.md). The room holds the seat
list, one claimable offer and one answer; the host's poll became a heartbeat
carrying the seat list; the window runs from that heartbeat rather than from
creation, so a table stays open all game.

_Ships:_ the single QR and the single link, which is what J2 and J7 actually
want.

The claim race turned out not to exist. Because a fresh offer only goes out
once the previous joiner is connected, only one handshake is ever in flight —
so two joiners cannot be picking a seat at the same time, and the total-order
tiebreak this plan plans for never has to fire. The second person sees
"somebody else is joining right now" and waits a beat. Four people scanning at
once take turns rather than connecting in parallel, which at a table is
invisible and buys away a whole class of race.

The one thing that did bite was staleness, exactly where the plan said it
might: the host publishes its next offer _before_ the new arrival's
`seat/claimed` comes back over the data channel, so the published seat list
was always one person behind. The heartbeat carrying the seat list is the fix,
and the joiner's picker re-reads while it is open so seats fill in as people
sit down.

**Phase 5, optional — `seat/added`.** Adding a seat to a running game (J3). A
new domain event, and the only new one in the whole plan. Deliberately last,
because it is the only piece that is genuinely a new capability rather than a
rearrangement of existing ones.

## Open questions

- **Is `seat/added` wanted?** J3 is the only journey needing it, and you said
  late invites are not a must. Without it, a host who wants a fifth player
  starts a new game with five seats — which after phase 1 costs nothing but the
  current life totals, and keeps everyone connected.
- **Does Settings hold anything besides Clear history?** If not, it can be a
  section of the menu sheet rather than a screen. Round clock (M8 model 1) and
  theme are the plausible future occupants.
- **Should the setup screen name players?** The roadmap defers it; this screen
  is where it belongs; it costs vertical space on a surface that must not
  scroll.
