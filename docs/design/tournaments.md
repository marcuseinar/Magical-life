# Leagues and tournaments

This is the one part of the product that genuinely needs a server, because it
needs a shared source of truth that outlives any single device and that no
participant can quietly edit.

## Formats

### Swiss — the workhorse

Every player plays every round; nobody is eliminated. Pair players with similar
records. This is what real MTG events run and it should be the default.

- **Rounds**: `ceil(log2(playerCount))`, floored at 3. 16 players → 4 rounds,
  64 → 6.
- **Match points**: win 3, draw 1, loss 0. This is the official system and
  deviating from it will confuse anyone who has played an event.
- **Byes** for odd counts: given to the lowest-ranked player who has not yet had
  one, scored as a 2–0 win.
- **Tiebreakers**, in order — match the official ones so results are portable:
  1. Match points
  2. Opponents' match-win percentage (OMW%), each opponent floored at 33.3%
  3. Game-win percentage (GW%)
  4. Opponents' game-win percentage (OGW%)

  The 33.3% floor stops a player being punished for having beaten someone who
  then dropped and lost out.

**Pairing is not a sort.** Naive "sort by points, pair adjacent" produces
rematches and dead ends. The correct model is _maximum-weight matching on a
complete graph_: each possible pairing is an edge weighted by how good that
pairing is (huge bonus for equal match points, large penalty for a rematch,
small penalty for score difference), and we want the highest-total-weight
perfect matching. Blossom algorithm, O(n³), trivial at tournament sizes.

This is exactly the kind of pure, heavily-invariant-laden algorithm that belongs
in `domain/` and gets hammered with `fast-check`: generate a random tournament
state, pair it, assert _no rematch unless mathematically forced_, _every player
paired exactly once_, _at most one bye_, _no player gets two byes_.

### Round robin

Everyone plays everyone. Correct for small, serious groups (≤ 8) and for
playgroup leagues. Circle method for scheduling; supports double round robin
(mirror with sides/play-draw swapped).

### Single and double elimination

For a top cut, or a small side event. Seeded from Swiss standings, standard
bracket seeding (1 v 8, 4 v 5, …) so the top seeds meet last. Double elim needs
a losers' bracket and the grand-final reset rule — decide up front whether the
losers'-bracket winner must win twice, because arguing about it afterwards is
miserable.

### Swiss into top cut — the standard real-world shape

N rounds of Swiss, then top 8 (or 4) single elimination. Should be a
first-class configuration, not something the organiser assembles by hand.

### Commander pods — the interesting one

Four-player pods break every assumption above. Pairing is no longer a matching
problem, it is a **set partitioning** problem: split N players into groups of 4
(with a 3-pod or 5-pod remainder) while minimising repeat opponents and
balancing pod strength. NP-hard in general and not solvable by Blossom.

Practical approach, and honest about being a heuristic:

1. Seed pods greedily by current standing (snake ordering, so pods are balanced
   rather than stratified).
2. Improve by local search — repeatedly swap two players between pods if the
   swap lowers a cost function, until no swap helps or a time budget expires.
3. Cost = `w₁·(repeat opponent pairs) + w₂·(pod score variance) + w₃·(seat
position repeats)`, with `w₁` dominant.

Scoring within a pod, three options to offer the organiser:

- **Win-only**: 3 for the win, 0 otherwise. Simple, brutal, common.
- **Placement**: 4/2/1/0 by elimination order. Rewards surviving, which better
  reflects multiplayer skill, but requires tracking elimination order —
  which the game screen already does.
- **Points with bonus**: win 3, plus 1 for each opponent you personally
  eliminated. Encourages engagement, discourages sitting back. Fun for casual
  leagues, contentious for competitive ones.

Seat position matters in Commander (turn order is a real advantage), so track
it and balance it across rounds as part of the cost function.

### League — the long game

Not a bracket at all: a persistent ladder over weeks or months.

- Players report matches against anyone in the league, whenever they play.
- Rating by **Glicko-2** rather than Elo: it models rating _uncertainty_, which
  is what you want when someone plays 12 games in a month and someone else plays 2. A player who has not played recently has their confidence decay, so their
  rating moves faster when they return.
- Seasons with a soft reset (regress ratings toward the mean rather than wiping),
  a minimum-games threshold for the final standings, and an optional
  attendance-points track so showing up counts for something.
- Multiplayer results feed the rating as a set of implied pairwise outcomes:
  a 4-player pod win is three wins, and placement order gives the rest.

## Running an event

The organiser's screen: create event → set format → open registration (a join
code or QR) → players self-register → lock → pair round → watch match slips come
in → post standings → next round.

Result reporting is where events actually break down, so:

- **Both players confirm.** One reports, the other gets a push to confirm. A
  disagreement flags the match for the organiser rather than resolving itself.
- **Auto-fill from the game screen.** If the match was played with Magical Life
  in table mode, the result is already known — final life totals, elimination
  order, game count. The slip arrives pre-filled and needs one tap. This is the
  single best reason for the tournament feature to live in the same app as the
  life counter, and it is what would make it better than a separate bracket site.
- **Round timer** with a visible clock and a "turns" call at time, matching how
  real rounds end.
- **Drops** are first class and mid-round. A dropped player's future opponents
  get byes correctly.

## Challonge and friends

Two directions, and they serve different people:

**Export** — do this first, it is cheap and it removes all adoption risk. Emit
standard formats so an organiser is never locked in:

- Challonge API: create tournament, push participants, report matches.
- A generic bracket JSON, plus CSV standings.
- `.dek`-adjacent conventions are irrelevant here, but Melee/EventLink style CSV
  imports are worth matching if the shapes are simple.

**Import** — read an existing Challonge bracket so an organiser already running
one can use Magical Life for the tables without moving their bracket.

On "make Challonge obsolete": the way to win is not feature parity on brackets —
that market is served. It is the thing Challonge structurally cannot do, which
is **knowing what happened at the table**. Automatic result capture, per-game
life histories, commander damage sources, elimination order, and league
statistics derived from actual play. Build the bracket engine well enough to be
credible, and win on the data that only a life counter can see.

## Data model sketch

```
Event      id, name, format, config, organiserId, state, createdAt
Round       eventId, index, startedAt, endedAt, state
Match       roundId, tableNumber, participants[], result, reportedBy[], confirmedAt
Participant eventId, userId?, displayName, seed, dropped, byes
Result      games[] { winnerId, lifeTotals, eliminationOrder }, gameWins
```

Standings are computed, never stored — the same discipline as the game state.
A stored standing is a standing that can be wrong.
