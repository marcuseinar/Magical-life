# Spike: does the WebRTC handshake actually work?

`docs/roadmap.md` calls the P2P transport the highest technical risk in the
project and says to spike the handshake before committing to the milestone's
shape. This is that spike. It is throwaway: nothing here is built, linted,
tested, or run in CI, and none of it should be trusted the way `src/` is.

Run it: `node spikes/webrtc-handshake/run.mjs` (needs
`PLAYWRIGHT_CHROMIUM_PATH` set if the sandbox ships its own Chromium, same as
the e2e suite).

## What it does

Two independent Playwright `BrowserContext`s — standing in for two separate
phones — each load a plain-JS peer module with no bundler and no path
aliases (`peer.mjs`; if the shape holds up, this is what
`src/adapters/transport/webRtcTransport.ts` becomes, properly tested). The
Node script plays the part of a QR code: it reads the offer SDP out of one
page and types it into the other, then does the same with the answer. This
is genuinely the only thing a real signalling path — QR or a short code
through a Cloudflare Worker — needs to do: carry two short strings once.

## What it found

**It works, and the SDP is smaller than `docs/design/multiplayer.md`
estimated.** Offer and answer both land at ~585 bytes raw, ~427 compressed
(deflate) across three runs — the doc's estimate was 600–900 bytes
compressed. Comfortable margin for a QR code at error-correction level L.

**Non-trickle ICE gathering can hang forever, silently, and the design
doesn't currently account for that.** This sandbox's outbound UDP appears to
be blocked — `stun:stun.l.google.com:19302` never answers, so
`iceGatheringState` never reaches `complete` on its own
(`diag.mjs` shows exactly one host candidate, an mDNS `.local` hostname, and
nothing after it). The design as written waits for `complete` unconditionally
before showing a QR code. On a network that blocks STUN — which includes
some captive portals and locked-down corporate WiFi, not just this sandbox —
a player would tap "start table" and nothing would ever happen, with no
error and no fallback.

**The fix is a timeout, and the same sandbox limitation turned into the
evidence for how short it can be.** `peer.mjs` waits at most `timeoutMs` (set
to 1500 here) for gathering to finish, then proceeds with whatever candidates
exist. Because this sandbox's *only* usable candidate is a host mDNS one —
gathered before any STUN round trip, in well under 100ms — the connection
still opens successfully even at a 300ms timeout in testing. That is
effectively a test of the same-WiFi case, which is the common one this app
is for: two players at one table are very likely on the same network, and
that path needs no STUN server at all.

What this does **not** validate: 1500ms is a reasoned placeholder, not a
proven number — this sandbox cannot produce a real `srflx` candidate to
measure how long an actual STUN round trip takes, so the timeout needs
checking against a real network before it ships. Also unvalidated here: real
NAT diversity (this is loopback on one machine either way), actual QR
encoding and camera scanning, the Cloudflare Worker signalling path, and
more than two peers.

## What changes in the design doc because of this

`docs/design/multiplayer.md`'s QR handshake section says ICE gathering
finishes before the code is shown, without qualification. It needs a stated
timeout and a stated fallback (proceed with host-only candidates, which is
exactly the same-network case) rather than an open-ended wait — recorded
there, not just here, since that document is what a real implementation
would be built from.
