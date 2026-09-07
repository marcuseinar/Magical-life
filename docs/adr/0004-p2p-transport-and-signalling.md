# ADR 0004 — P2P transport and signalling

- Status: Accepted
- Date: 2026-09-07

## Context

Requirement 6 (ADR 0001) is table play with no dedicated server: WebRTC data
channels between the players' own devices. WebRTC gives a direct channel but
not a way to find the peer — something has to carry the offer/answer/ICE
handshake once, before the channel exists to carry anything else.

Three needs pull in different directions:

- **Zero infrastructure cost**, matching ADR 0001's free-hosting constraint.
- **Works on bad game-shop WiFi**, including networks that block STUN or
  isolate clients from each other.
- **The server, if one is ever in the loop, must not see game state.** Table
  play has no account (ADR 0003) and no authority (ADR 0002 — any peer may
  write any event about itself); a signalling path that could read life
  totals would be a bigger trust surface than the feature needs.

`spikes/webrtc-handshake/` de-risked the handshake mechanics before any of
this was committed to: it measured a real offer at ~427 bytes
deflate-compressed (comfortably inside a QR code), and found that
`iceGatheringState` can hang forever with nothing on screen when STUN is
unreachable — a bounded gathering timeout is not optional. Both findings
inform the decision below; the numbers and the reasoning live in the spike's
own `README.md` and in `docs/design/multiplayer.md`, which this ADR
summarises rather than duplicates.

## Options considered

**Always relay through TURN.** Simplest to implement — one path, no fallback
logic — and it is what most WebRTC how-tos default to. Rejected: TURN relays
media/data continuously and is priced by bandwidth, which turns every game
into a running cost for a feature ADR 0001 requires to be free. It also
throws away the case that matters most for this app — players physically at
the same table — by routing local traffic through a distant relay by default.

**A dedicated relay server that is authoritative for game state.** Would
simplify convergence (no merge needed, ADR 0002's ownership rule becomes
unnecessary) but reintroduces exactly what ADR 0002 rejected a CRDT to avoid
building, adds a server in the critical path of the game whose one job is to
work when the venue's WiFi doesn't, and requires an account or table secret
to keep one player from reading another table's state — none of which table
play needs today.

**QR-only, no server at all.** Genuinely zero infrastructure and works
offline, which is real strength for a game-shop basement. Rejected as the
only path: it scales badly past two players (the host scans once per
joiner) and gives no answer at all when players are not physically together
or the QR round-trip fails partway.

**Tiered strategy: try the free and local path first, degrade toward the
one that costs money only when the network forces it.** Chosen.

## Decision

`Transport` (`src/application/ports/transport.ts`) is a port; every
connection path is an adapter behind it, so the UI and the domain never know
which one is live — the same pattern ADR 0002's ownership rule and the
`EventLog` port already establish. Three paths, attempted in order:

1. **QR handshake — no server.** The host's device gathers ICE candidates for
   a bounded window (spiked at 1500 ms, not an unqualified wait — the spike's
   hung-forever finding is why this is bounded rather than "wait for
   complete") and renders whatever it has as a QR code; the joiner scans it,
   answers, and shows their own code back. Works with no network path to any
   server at all, which is the case a real game shop hits often enough to
   design for first, not as a fallback.

2. **Short-code signalling — the default.** A Cloudflare Worker plus one
   Durable Object per table (`workers/signalling/`) carries the offer/answer
   blobs between peers, keyed by a 4-character room code, and expires the
   room 10 minutes after creation. It sees opaque SDP blobs and an invited
   seat's id and name — never a life total, never a game event. Cost is a
   handful of requests per game, inside the Workers free tier by orders of
   magnitude (verify current limits before launch; they change).

3. **WebSocket relay through the same Durable Object — last resort.** When
   direct WebRTC fails outright (client-isolated WiFi, hostile NAT), fall
   back to relaying game events themselves over a WebSocket through the same
   Durable Object, rather than standing up TURN. This is only defensible
   because payloads are tiny — a life change is under 200 bytes — so the
   bandwidth TURN would cost stays negligible even engaged. It is a
   dedicated server in the strict sense, and it is the one path that touches
   game state; it is used only when paths 1 and 2 cannot connect the peers
   directly at all.

The manual-code path already shipped (`src/adapters/transport/webRtcTransport.ts`,
`src/ui/interaction/connectionCode.ts`) — paste an offer, paste a reply, no
QR, no server — is the same non-trickle-ICE mechanism as path 1, with the
code copied by hand instead of scanned. It is not a fourth path; it is path
1's handshake wearing a different UI while the QR renderer and the Worker
wiring land.

## Consequences

- No TURN spend, ever, for the common case — cost is bounded to Workers
  free-tier request counts, which do not scale with game duration or
  payload size the way TURN bandwidth does.
- The trust model stays what ADR 0002 and ADR 0003 already committed to:
  the signalling server is never in a position to read game state, because
  it never receives any. Only the relay fallback carries events, and it
  carries them opaquely over a channel the app already treats as one more
  `Transport` adapter, DTLS not applying there but nothing sensitive
  travelling either.
- The UI gets a small, honest job: show which of the three is live (a
  connection-quality chip — direct, relayed, or offline) rather than
  pretending they are the same thing.
- Complexity cost: three adapters to build and test instead of one, and a
  degrade-in-order policy that itself needs a test (does the app actually
  fall through to short-code signalling when QR gathering times out, and to
  relay when the data channel never opens). Accepted because the
  alternative — picking one path — either costs money on every game (TURN)
  or fails outright on a common network shape (QR-only) or a common social
  shape (short-code-only, when players are not physically together to scan
  anything).
- The bounded ICE-gathering timeout is a correctness requirement, not a
  tuning knob: without it, path 1 does not degrade to path 2, it hangs.

## Revisit if

Cloudflare's free tier changes shape enough that short-code signalling stops
being free at the request volumes this app actually produces, or a venue
pattern emerges (large public events, M5) where the relay fallback's request
volume — not its per-message size — becomes the constraint. Neither is true
today.
