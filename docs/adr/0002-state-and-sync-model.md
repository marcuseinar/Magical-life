# ADR 0002 — Event-sourced state with author ownership

- Status: Accepted
- Date: 2026-08-23

## Context

The app must show life totals, support undo, keep a log players can inspect,
survive a device going offline mid-game, and merge state between peers with no
server to arbitrate.

## Options considered

**Mutable state object, synced by diff.** Simplest to write, and wrong here:
undo needs a separate history stack, the "shared log" feature needs a second
parallel structure, and two peers editing concurrently need conflict resolution
that has no correct answer.

**A CRDT library (Yjs, Automerge).** Genuinely solves concurrent editing, and is
what you would reach for by default. Rejected because it solves a problem we do
not have: it is built for _shared_ mutable structures where any participant may
edit any field. Our data has a natural ownership partition (below), which makes
the conflict case impossible by construction. The library would add a
non-trivial dependency, an opaque binary format, and a merge semantics we would
have to reason about, in exchange for handling a case that cannot arise.

**Append-only event log with author ownership.** Chosen.

## Decision

State is `fold(events)` over an append-only log. Nothing else is durable.

**Ownership rule: a device may only author events whose `target` is its own
player.** If you deal me commander damage, my device records it, tagged with you
as the source.

This is not an arbitrary constraint — it mirrors what happens at a real table,
where each player maintains their own total and announces changes aloud.

## Consequences

- Merging two logs is set union over `EventId`, where `EventId` is
  `${authorId}:${seq}`. Uniqueness is structural, not probabilistic.
- Concurrent conflicting writes to the same value are impossible. There is no
  merge policy to get wrong, no last-write-wins, no tombstone reconciliation
  beyond explicit retraction.
- Ordering for display is `(lamport, authorId)` — a total order, identical on
  every device.
- Undo is an `event/retracted` event. History is append-only; nothing is ever
  rewritten or deleted.
- The shared log, offline resync, bug-report replay, and post-game statistics all
  fall out of the storage format rather than being separate features.
- Cost: an absent or dead-battery player needs an explicit
  `authority/delegated` event before someone else can record on their behalf.
  This is a small amount of extra work in exchange for the invariant, and the
  delegation is visible in the log rather than silent.
- The reducer is a pure function of `(state, event)`. It is the single highest-value
  test target in the codebase and the natural home for property-based fuzzing.

## Revisit if

Free-form collaborative text ever enters the game state (shared notes, a
scratchpad). That is the case CRDTs are actually for, and it would justify
introducing one for that field alone rather than for the whole model.
