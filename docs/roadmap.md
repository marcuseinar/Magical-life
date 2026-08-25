# Roadmap

Ordered so that every milestone ships something usable on its own, and so that
each one's architecture is what the next one needs. Nothing here is a date.

## M1 — The life counter ✅

The whole product for most users. If this is not excellent, nothing later matters.

- Solo device, 1–6 players, rotating panel layouts
- Tap zones (style 1) and drag-scrub (style 2), sharing the pending-delta machine
- Formats: Standard 20, Commander 40, Two-Headed Giant 30, custom
- Poison and the counter tray; monarch/initiative flags
- Undo via retraction; rematch (same players and format, fresh totals)
- Random first player, revealed by a spotlight travelling round the table —
  decided before the animation runs, so the theatre cannot change the result
- No scrolling, no zooming: the app is a fixed surface
- Persistence, so a reload mid-game loses nothing
- PWA: installable, offline, keep-awake
- Dark and light themes
- Deployed to GitHub Pages by CI

**Done when**: a full Commander game can be played on one phone without touching
anything but life totals, and closing the app mid-game loses nothing.

Shipped, including editable player names: tap a name to change it, tidied and
clamped to sixteen characters so a plate stays readable at six players.

Not yet built and deliberately deferred: a visible game log view (the log exists
and drives undo, but has no screen yet), a first-run hint for the drag gesture,
and naming players during setup rather than once the game has started.

## M2 — Commander depth

- Commander damage matrix, the crown chip, and the damage sheet
- Attribution on the pending badge (one tap tags life loss as commander damage)
- **Once the table is connected (M3), damage gets confirmed rather than
  asserted**: when a player records commander damage, the named source sees a
  prompt to confirm it was them. Cheap to build on the event log — a claim event
  and a confirmation event — and it removes the one thing a shared counter
  cannot otherwise settle: who actually dealt it. Until M3 there are no other
  devices to ask, so this waits on the transport.
- Elimination detection across all three lethal conditions
- Post-game summary: elimination order, damage sources, game length

## M3 — The table (P2P)

- **The join flow, as the host imagines it**: one player sets the game up on
  their device exactly as they do today, then taps a button and gets a QR code
  _and_ a short game code per seat. Each player scans or types their own, and
  their phone becomes that panel. This is the shape the signalling design in
  `docs/design/multiplayer.md` should serve, and it is what the QR handshake
  there is for.
- WebRTC transport adapter, log merge, convergence
- QR handshake and short-code signalling (Cloudflare Worker + Durable Object)
- Relay fallback for hostile networks
- Connection-quality chip; offline-and-catch-up
- Shared log across devices

**Highest technical risk in the project.** Spike the handshake before committing
to the milestone's shape.

## M4 — Native shells

- Capacitor wrapping the same static build
- Haptics, keep-awake, safe areas, back-button handling
- App Store and Play Store listings, screenshots, privacy declarations
- Automated builds from tags

Deliberately after M3: the store review process is friction, and shipping it
once against a feature-complete counter beats shipping it three times.

## M5 — Events

- Accounts: passkeys plus email links (ADR 0003)
- Swiss with correct pairing and official tiebreakers; round robin; single and
  double elimination; Swiss-into-top-cut
- Commander pods with local-search pairing and seat balancing
- Organiser flow, round timer, drops, both-players-confirm result reporting
- Auto-filled results from M3 table play — the feature that justifies the whole app
- Challonge export, then import
- Leagues with Glicko-2 and seasons

## M6 — Rules assistant

Natural-language rules questions. Sits here because it is genuinely useful and
technically tractable, unlike M7.

- The Comprehensive Rules and Oracle text as a local corpus
- Retrieval over the rules, then a model to phrase the answer, with citations to
  rule numbers so the answer is checkable rather than trusted
- Card lookup by name with current Oracle text
- Works offline for card text; the conversational layer needs a connection

Open question: on-device model versus a hosted call. On-device keeps it free and
private but constrains quality; hosted is better but introduces the app's first
per-use cost. Decide with a spike, not in advance.

## M7 — Ambient sensing (speculative)

The audio/video ideas. Recorded honestly rather than optimistically:

- **Turn detection from audio** is plausible. Magic has strong verbal cues — "go",
  "pass turn", "your turn" — and keyword spotting is a solved, on-device problem.
  This is the piece to try first, and it is worth trying.
- **Automatic life tracking from audio** is harder but not absurd: "I attack for
  seven" is a parseable utterance. Treat any detection as a _suggestion_ the
  player confirms, never an automatic change. An app that silently gets a life
  total wrong is worse than no app.
- **Video board-state detection** is a research project, not a feature. Card
  recognition in messy table conditions, with sleeves, glare, overlap, and
  tokens, is unsolved for anyone. Do not commit to it.

Non-negotiable if any of this ships: always-on audio is **opt-in per game**, with
an unmistakable persistent indicator, processed on-device, never uploaded, and
never retained. Getting this wrong once destroys the app's reputation permanently.

## M8 — Time tracking (speculative)

The chess-clock idea, and worth writing down why it is hard.

Magic turns are not chess turns. A turn is a conversation: I cast, you respond,
I respond to your response. A naive per-player clock charges the active player
for time their opponent spends thinking about a counterspell, which is both
unfair and gameable.

Three models, from tractable to not:

1. **Round clock** (50 minutes, "turns" called at time). What real tournaments
   use. Trivial, genuinely useful, and it should ship on its own regardless of
   whatever else happens here.
2. **Turn clock**. Track wall time per turn, attributed to the turn's active
   player. Imperfect but informative — it surfaces the pathologically slow turn
   without pretending to be fair.
3. **Priority clock**. Charge time to whoever holds priority. Correct in theory,
   and it requires players to tap on every priority pass, which nobody will do.
   Interesting only if M7's turn detection ever works well enough to infer it.

Ship model 1 early. Model 2 when turn tracking exists. Model 3 probably never,
and that is fine.

## M9 — Agents (speculative)

LLM agents that participate in real time: a judge that watches the log and flags
a probable rules mistake, a coach that reviews a game afterwards. Depends
entirely on M6 and M7 producing something reliable. Revisit then; do not design
for it now.
