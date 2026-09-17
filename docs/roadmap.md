# Roadmap

Ordered so that every milestone ships something usable on its own, and so that
each one's architecture is what the next one needs. Nothing here is a date.

## M1 — The life counter ✅

The whole product for most users. If this is not excellent, nothing later matters.

- Solo device, 1–6 players, rotating panel layouts
- Tap zones (style 1) and drag-scrub (style 2), sharing the pending-delta machine
- Formats: Standard 20, Commander 40, Multiplayer 30, custom
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

  **Superseded in shape, not in intent, and now rebuilt** — see
  `docs/design/shell-and-lobby.md` and ADR 0006. A code per _seat_ meant the
  host ran the same errand once per player and never saw the table. It is now
  one code, one QR and one link for the whole table, with the offer behind
  them rotating and each joiner picking their own seat. The QR handshake is
  unchanged and stays per-seat, because one offer shown to one scanner is
  inherent to holding a phone up to somebody.

- WebRTC transport adapter, log merge, convergence
- QR handshake and short-code signalling (Cloudflare Worker + Durable Object)
- Relay fallback for hostile networks
- Connection-quality chip; offline-and-catch-up
- Shared log across devices

**Highest technical risk in the project.** Spike the handshake before committing
to the milestone's shape.

**Spiked**, in `spikes/webrtc-handshake/` — throwaway, not built or tested the
way `src/` is, run by hand rather than in CI. It found the handshake works and
the QR-size estimate was pessimistic (~427 bytes compressed, not 600–900), and
it found a real gap the design doc didn't have: non-trickle ICE gathering needs
a timeout or it can hang forever on a network that blocks STUN, with nothing on
screen and no error. `docs/design/multiplayer.md` now says so. Full writeup and
the numbers are in the spike's own `README.md`.

Two pieces of real, permanent groundwork turned out to already exist:
`GameSession.merge()` — dedup, total ordering, and the lamport clock correctly
advancing past events from other authors — is already built and tested
(`src/application/gameSession.test.ts`), which is most of what ADR 0002 needs
to hold up under a real remote peer. And `Transport`
(`src/application/ports/transport.ts`) is now a real, committed port — pure
type, no adapter behind it yet.

**Built**: the real `WebRtcTransport` adapter, proven through e2e journeys the
same way `IndexedDbEventLog` is; a manual-code join flow on top of it — paste
an offer, paste a reply, no QR, no server — proven end to end with two
independent browser contexts converging on the same game
(`tests/e2e/table-connection.spec.ts`); the Cloudflare Worker and Durable
Object for short-code signalling (`workers/signalling/`), independently
deployable and tested against the real Workers runtime; the client wiring
that connects the two — a short code, a QR, and a shareable link as the
default join path, falling back to the manual code without asking anyone to
read an error if the worker can't be reached; and the QR handshake path
itself (ADR 0004's path 1) — a real camera scanner
(`src/adapters/platform/cameraQrScanner.ts`, `getUserMedia` + `jsQR`) reading
the manual code's offer/reply as a QR instead of a paste, on both the host
and joiner side, proven in `tests/e2e/qr-handshake.spec.ts` against a real
`<video>` element fed by a synthesised camera stream. See
`docs/design/multiplayer.md` for why the QR turned out denser than the
spike's original estimate; and the connection-quality chip
(`src/ui/components/ConnectionChip.svelte`) — "Direct connection" once a
tracked transport connects, "Connection lost" the moment any tracked
transport has ever dropped, driven by `GameStore.linkState`
(`src/lib/gameStore.svelte.ts`) and proven fast and deterministically at the
unit level against a fake `Transport` (`gameStore.svelte.test.ts`), since a
real peer's ICE failure has no bounded timeout to wait on in an e2e test the
way the connecting phase does.

**Built**: the relay fallback (ADR 0004's path 3) — a plain WebSocket
through the same Durable Object, paired by the ticket a specific offer/
answer already used, carrying game events themselves rather than standing up
TURN. Reachable only from the short-code path (`hostTable`,
`joinTableAsSeat` in `src/lib/tableConnection.svelte.ts`), since only that
path has a server and a ticket to pair a relay against; the QR and manual
paths have no answer for this failure by design, unchanged. Engaged when
`webRtcTransport.ts`'s `connectionState` reports `'failed'` — the one signal
that fires even when a data channel never opens at all, which used to leave
a joiner hanging forever with nothing on screen and no error. Proven at two
levels rather than through a real, load-sensitive ICE failure: the relay
wire itself — real ticket-pairing and forwarding through the actual Durable
Object — is proven against the real Workers runtime
(`workers/signalling/test/relay.test.ts`); the decision to open one, with
the right address, at the right moment, is proven against a connection
stubbed to fail immediately (`src/lib/tableConnection.svelte.test.ts`). The
connection-quality chip does not yet distinguish a relayed link from a
direct one — still `'direct'`, since a working link is a working link — a
deliberately deferred follow-up, same as the chip's own "lost" gap once was.

## M4 — Native shells

- Capacitor wrapping the same static build
- Haptics, keep-awake, safe areas, back-button handling
- App Store and Play Store listings, screenshots, privacy declarations
- Automated builds from tags
- **Bluetooth discovery — find the table without typing anything.** A fourth
  connection path under ADR 0004, and the reason it sits here rather than in
  M3: Web Bluetooth is central-role only. A browser can scan for peripherals
  but cannot advertise as one, so two phones running the web app both scan and
  neither is findable, and iOS Safari has no Web Bluetooth at all. Native BLE
  is the first time this is possible, not the first time it is convenient.

  Worth doing properly when it comes: BLE carries the _handshake_, not just a
  beacon. The spike measured an offer at ~427 bytes compressed, which fits in a
  couple of GATT writes — so this is zero-infrastructure like the QR path, with
  the scanning step removed, rather than a fancier way to point at the worker.

  Costs to weigh before committing: Android needs `BLUETOOTH_SCAN` on API 31+
  or `ACCESS_FINE_LOCATION` below it, and a life counter asking for location is
  a prompt people decline. iOS advertises reliably only in the foreground,
  which is the host's actual situation but not a guarantee. `/join` being a
  list of tables rather than a code box (`docs/design/shell-and-lobby.md`) is
  what keeps this an addition instead of a rewrite.

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
