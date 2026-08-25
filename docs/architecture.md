# System design

## Shape

Clean Architecture, dependencies point inwards only. Nothing in an inner ring
may import from an outer one.

```
        ┌─────────────────────────────────────────────┐
        │  ui/            Svelte components, routes    │  ← swappable
        ├─────────────────────────────────────────────┤
        │  adapters/      IndexedDB, WebRTC, clock,    │  ← swappable
        │                 haptics, HTTP, id generator  │
        ├─────────────────────────────────────────────┤
        │  application/   use cases + ports            │
        ├─────────────────────────────────────────────┤
        │  domain/        entities, events, reducer,   │  ← pure, zero deps
        │                 rules, invariants            │
        └─────────────────────────────────────────────┘
```

### `domain/` — pure

No imports outside itself. No `Date.now()`, no `crypto.randomUUID()`, no
`window`, no `fetch`. Time and identity arrive as arguments. This is what makes
it exhaustively testable and what keeps the Rust escape hatch of ADR 0001 open.

Contains: `GameEvent`, `Player`, `GameConfig`, `reduce(state, event)`,
`fold(events)`, format rules (starting life, lethal poison, lethal commander
damage), and later the pairing algorithms.

### `application/` — use cases and ports

One file per use case, each a function taking its dependencies as an argument:

```ts
export const applyLifeDelta =
  (deps: { clock: Clock; ids: IdSource; log: EventLog }) =>
  async (playerId: PlayerId, delta: number): Promise<void> => { … }
```

Ports are interfaces declared here and implemented in `adapters/`:
`Clock`, `IdSource`, `Rng`, `EventLog`, `Transport`, `Storage`, `Haptics`.

`Rng` exists for the same reason as `Clock`: choosing who goes first is random,
but `domain/` must stay pure, so the _choice_ is made in a use case and reaches
the domain as a decided fact.
Tests substitute fakes; nothing is mocked by monkey-patching.

### `adapters/` — the outside world

One adapter per port, each small enough to read in a sitting. `IndexedDbEventLog`,
`WebRtcTransport`, `LocalRelayTransport`, `SystemClock`, `FixedClock` (tests),
`CapacitorHaptics`, `NoopHaptics`.

Because the transport is a port, single-device play, P2P play, and (later)
server-relayed play are three adapters behind one interface. The UI cannot tell
them apart.

### `ui/` — Svelte

Components are dumb. They render props and emit intents. They never reach into
storage or the network; they call use cases through a thin context object
injected at the root. This is what makes component tests cheap: mount, pass a
fake, assert on the accessibility tree.

## Directory layout

```
src/
  domain/
    events.ts          GameEvent union + constructors
    reducer.ts         reduce / fold — the heart of the app
    rules.ts           format definitions, lethal thresholds
    invariants.ts      assertions the state must always satisfy
  application/
    ports/             Clock, IdSource, EventLog, Transport, …
    usecases/          applyLifeDelta, startGame, joinTable, undo, …
  adapters/
    storage/
    transport/
    platform/
  ui/
    tokens/            design tokens (see docs/theming.md)
    components/        Counter, PlayerPanel, DeltaBadge, CounterTray, …
    routes/            SvelteKit routes
  lib/
    stores/            reactive projection of domain state
tests/
  e2e/                 Playwright
  fuzz/                fast-check property suites
```

## Data model

State is **derived, never stored**. The durable thing is an append-only event
log; the rendered totals are `fold(events)`.

```ts
type GameEvent =
  | { kind: 'game/started'; gameId: GameId; config: GameConfig; players: Player[] }
  | { kind: 'life/changed'; target: PlayerId; delta: number; source?: PlayerId }
  | {
      kind: 'commander/damaged';
      target: PlayerId;
      from: PlayerId;
      commander: CommanderSlot;
      delta: number;
    }
  | { kind: 'counter/changed'; target: PlayerId; counter: CounterKind; delta: number }
  | { kind: 'flag/moved'; flag: FlagKind; to: PlayerId | null }
  | { kind: 'player/eliminated'; target: PlayerId; cause: EliminationCause }
  | { kind: 'event/retracted'; retracts: EventId } // undo
  | { kind: 'game/ended'; winner: PlayerId | null };
```

Every event additionally carries the envelope:

```ts
type Envelope = {
  id: EventId; // `${authorId}:${seq}` — globally unique by construction
  authorId: PlayerId; // the device that wrote it
  seq: number; // monotonic per author
  at: number; // author's wall clock, for display only, never for ordering
  lamport: number; // for deterministic ordering across peers
};
```

Why events and not a state object:

- Undo is a retraction event, not a mutation. History survives.
- The shared log the user asked for is free — it _is_ the storage format.
- Merging two peers' logs is set union, because of the ownership rule below.
- Replay makes bugs reproducible: attach the log to a bug report and re-fold it.

`CounterKind` covers poison, energy, experience, rad and ticket. Adding one is a data change, not a code change.
`FlagKind` covers monarch, the initiative, city's blessing, and the day/night
designator — states that exactly one player (or nobody) holds at a time.

## Ordering and merge

The rule that makes this simple: **the player who is affected owns the event.**

A device only ever appends events whose `target` is its own player. If you deal
me commander damage, _my_ device records it, tagged `from: you`. Announcing it
across the table is what players already do; the app just mirrors it.

Consequences:

- Two devices can never write conflicting events about the same value. There is
  nothing to reconcile — merge is set union over `EventId`.
- No CRDT library, no vector clocks beyond a Lamport counter for display order.
- A device that goes offline mid-game reconnects and ships its missing `seq`
  range. The gap is visible, so the UI can say "waiting on Anna, 3 events behind"
  instead of silently diverging.
- `fold` sorts by `(lamport, authorId)` — total order, deterministic on every
  device, no ties.

The trade: dealing damage to someone whose phone is dead needs a proxy. Handled
by letting a table host be granted write authority for a specific absent player,
recorded as an explicit `authority/delegated` event so the log stays honest.

## Modes of play

1. **Solo device** — one phone, 1–6 players on screen. No network. The default,
   and the only mode Milestone 1 ships.
2. **Table (P2P)** — each player on their own device, WebRTC data channels, one
   shared log. See `docs/design/multiplayer.md`.
3. **Event (server)** — a tournament backend adds pairings, standings, and
   identity. Only this mode requires login. See `docs/design/tournaments.md`.

Each mode is additive. Mode 1 never loads mode 2's code (route-level code
splitting), so the cold start of the common case stays minimal.

## Performance budget

Enforced in CI; a regression fails the build.

| Metric                                     | Budget   |
| ------------------------------------------ | -------- |
| Initial JS, gzipped, solo route            | ≤ 60 kB  |
| Time to interactive, mid-range Android, 4G | ≤ 1.5 s  |
| Tap → visible life change                  | ≤ 100 ms |
| Lighthouse performance                     | ≥ 95     |

## Where the code is today

Milestone 1 is built: solo play, both input styles, counters, flags, undo,
persistence, offline, and the two themes. The layers above all exist, the
dependency rule is enforced by `eslint-plugin-boundaries` (verified to fail a
deliberate violation, not merely configured), and `domain/` sits at 100% branch
coverage.

Two things stated in this document are not yet built and are marked as such
above: commander damage (M2) and every transport other than the local one (M3).
`Transport` is therefore a design commitment, not yet an interface with two
implementations — it arrives with the peer-to-peer work rather than being
speculatively stubbed now.

## What is deliberately not decided yet

- Whether the rules assistant runs on-device or calls out (Milestone 6).
- The audio/video detection approach (Milestone 7) — it needs a spike first,
  and it is the requirement most likely to change shape before we reach it.
