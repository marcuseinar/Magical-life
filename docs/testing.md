# Testing strategy

Test-driven: the failing test comes first. The point is not ceremony — it is that
a test written after the code tends to test what the code does, not what it
should do.

## The pyramid, with what goes where

```
        ╱ ╲         E2E user journeys        Playwright          few, slow, real
       ╱───╲        Integration              Vitest + fakes      moderate
      ╱─────╲       Component                Testing Library     many
     ╱───────╲      Unit + property          Vitest + fast-check most, instant
    ╱─────────╱
```

### Unit — `domain/`

Pure functions, no test doubles needed at all, because there is nothing to double.
Target: **100% branch coverage, enforced**. This layer is small, it is where the
rules live, and there is no excuse.

### Property-based — the reducer and the pairing algorithms

This is where `fast-check` earns its place, and it is the closest thing to the
fuzzing the brief asks for.

Generate arbitrary event sequences and assert invariants that must hold for
_every_ possible history:

- `fold` is deterministic: shuffling the input and re-sorting yields identical state.
- `fold(a ∪ b) === fold(b ∪ a)` — merge is commutative. This is the property that
  makes P2P correct, and it is worth a hundred hand-written tests.
- Retracting an event yields exactly the state as if it had never been appended.
- Life is only ever changed by a `life/changed` event; no other event kind moves it.
- Applying the same event twice is a no-op (idempotence under replay).
- No sequence of legal events can produce `NaN`, `Infinity`, or a non-integer total.

For pairing:

- Every player is in exactly one match per round.
- At most one bye per round; no player receives two byes in a tournament.
- No rematch occurs unless the state makes it unavoidable — and when it is, the
  test asserts unavoidability rather than accepting the rematch.
- Standings are a total order with documented, deterministic tiebreaking.

Failing cases are shrunk by `fast-check` to a minimal reproduction and then
**pinned as a regression unit test**. A property test that finds a bug should
leave a permanent example behind.

### Component — `ui/`

`@testing-library/svelte`. Query by role and accessible name, never by CSS class
or test id — a test that survives a refactor of the markup is testing behaviour;
one that breaks was testing implementation.

Each component gets: renders its state, emits the right intent on interaction,
handles its edge cases (zero, negative, very large numbers, long names), and is
keyboard operable.

The delta state machine gets its own exhaustive suite with a fake clock: every
transition, timer reset on new input, cancel, commit, and the interleaving of tap
and drag input in "both" mode.

### Integration — application + adapters

Use cases against real adapters wherever possible: the actual IndexedDB via
`fake-indexeddb`, a real `RTCPeerConnection` pair in a single browser context for
transport tests. Fakes only for time, randomness, and identity — the three things
that must be deterministic.

Specifically covered:

- Full round trip: tap → use case → event → storage → reload → same state.
- Two in-process peers exchanging events and converging.
- A peer dropping mid-game, missing events, reconnecting, and catching up.
- Storage schema migration from every previously shipped version.

### End-to-end — Playwright

Real journeys, on real mobile viewports, in Chromium **and** WebKit — WebKit is
not optional when a large share of Magic players are on iPhones and Safari's
IndexedDB and WebRTC behaviour differs.

Journeys:

1. Cold open → 20 life showing → tap down to 0. The core path; runs on every commit.
2. Commander game, 4 players, commander damage to 21, elimination.
3. Two browser contexts join a table, exchange life changes, converge.
4. One context goes offline, changes life, comes back, converges.
5. Reload mid-game and lose nothing.
6. Install as a PWA and launch offline.
7. Create an event, register 8 players, pair 3 Swiss rounds, report results,
   check standings.

Plus a **monkey suite**: a seeded random walk over the UI (tap, drag, rotate,
background, reload) that asserts the app never crashes, never renders `NaN`, and
that state always reloads to match what was on screen. The seed is printed on
failure so any run is reproducible. This is the "random user journeys" the brief
asks for, and it is the cheapest real bug-finder in the whole suite.

### Visual regression — planned, not yet wired up

The intent is Playwright screenshots of each panel layout (1–6 players) in each
theme at three viewport sizes, to catch the restyling regressions behavioural
tests cannot see.

Deliberately not switched on yet: baselines rendered in one container and
compared in another differ on font rasterisation alone, so the gate would fail
for reasons that have nothing to do with the change under test. It needs a
pinned rendering environment first. Until then this is the one gap in the
strategy below, and it is a known one rather than an oversight.

### Accessibility

`axe-core` via `@axe-core/playwright` on every E2E route. Zero violations is a
build gate, not a report. Since every query in the component tests goes through
the accessibility tree, an inaccessible component fails long before this.

## What is not tested

Stated so the gaps are deliberate:

- Cloudflare's platform behaviour — we test our handlers, not their runtime.
- Real NAT traversal against real hostile networks. Automatable only with real
  infrastructure; covered by a manual pre-release checklist instead.
- **Offline reload in Safari.** Playwright's WebKit build throws an internal
  error on `page.reload()` under offline emulation, before the page is involved,
  so the test would measure the harness rather than the app. The service worker
  contract it depends on — installed, controlling, shell cached — _is_ asserted
  in every browser. Add "aeroplane-mode reload on a real iPhone" to the manual
  pre-release checklist.
- Native shell behaviour beyond smoke tests, until Milestone 4 adds device runs.

## CI gates

Every pull request must pass, in this order (fastest feedback first):

1. `tsc --noEmit`, ESLint, Prettier
2. Unit + property tests — under 10 s, or they are too slow to run on save
3. Coverage: 100% branch on `domain/`, 90% overall
4. Component tests
5. Build + bundle-size budget (see `docs/architecture.md`)
6. Playwright E2E, sharded
7. `axe` accessibility gate
8. Visual regression

The architectural boundary is enforced mechanically, not by review:
`eslint-plugin-boundaries` fails the build if `domain/` imports anything, or if
`ui/` imports an adapter directly. Layering that depends on discipline decays.

## Deployment

Default branch → GitHub Actions → GitHub Pages, on green only. Every pull
request also publishes to `/pr-<number>/` and comments the link, so a UI change
is reviewable on a phone rather than in a diff. See `docs/deploying.md`.

Merging is blocked until `Types, lint, tests`, `User journeys` and
`Build and publish` are all green.
