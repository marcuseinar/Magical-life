# ADR 0006 — One code for the table

- Status: Accepted
- Date: 2026-09-16

## Context

ADR 0004's short-code path shipped as one room per _seat_. A signalling room
held exactly one offer and one answer, keyed to the player it was for
(`invitePlayerId`, `invitePlayerName` in the offer payload), so a host seating
three people ran the same errand three times: tap a seat, wait for a code,
send it, repeat. At no point did any screen show the host their own table, so
"is everyone in yet?" was answerable only from memory.

That shape was right for what it was built to do — prove a handshake works —
and wrong for how people actually sit down at a table. A host holds one phone
up, or pastes one link into a group chat, and everybody joins from it.

The roadmap's M3 note already described the per-seat shape as what the design
should serve; `docs/design/shell-and-lobby.md` superseded that, and this ADR
is the decision behind it.

## Options considered

**Keep one room per seat, and show them all at once.** The host's screen lists
every seat with its own code and QR. No worker change at all, and the lobby
view is most of the value. Rejected as the end state: it cannot produce the
one link a host pastes into a group chat, and a screen showing four QR codes
is not a table, it is a spreadsheet.

**One room, several offers held at once — a pool.** The host publishes N
offers up front and joiners take one each. Genuinely parallel, so four people
scanning simultaneously all connect at once. Rejected: the host must guess N,
every unclaimed offer is a WebRTC connection left hanging, and two joiners
picking the same seat becomes a real race that the signalling layer would
then have to arbitrate — which is a second source of truth about seats
alongside the event log.

**One room, one offer at a time, rotated.** The host publishes an offer;
exactly one joiner claims it; the host accepts their answer, connects them,
and publishes a fresh offer under the same code. Chosen.

## Decision

A signalling room is one **table**, not one seat.

```
Host    open table ──────────────> code XKCD, offer #1
Joiner  read XKCD  <────────────── seats, and whether a place is free
Joiner  claim ─────────────────────> offer #1 (and nobody else gets it)
Joiner  answer, naming a seat ────> ticket + sdp + seatId
Host    poll ─────────────────────> that answer; accept, connect
Host    publish ──────────────────> offer #2, same code
```

The code, the QR and the link never change. What rotates behind them is the
offer.

**Claiming is a compare-and-swap.** The offer leaves the room with its first
claimant, so two people scanning the same QR in the same instant cannot both
answer the same SDP. A Durable Object serialises its own calls, which is what
makes a read-modify-write correct here without any locking of our own.

**Only one handshake is ever in flight**, because a fresh offer only goes out
once the previous joiner is connected. This is what removes the seat-claim
race the design doc anticipated: two joiners cannot take the same seat because
two joiners cannot be picking at the same time. The second sees "somebody else
is joining right now" and waits a beat.

**A ticket identifies the offer.** A joiner who takes too long finds the host
has moved on, and their answer is refused rather than connecting them to a
peer that no longer exists.

**The host's poll is a heartbeat that carries the seat list.** One call says
"still here, here is the table as it now stands, has anybody answered?". The
seat list goes up because the host publishes its next offer _before_ the new
arrival's `seat/claimed` has come back over the data channel — without it,
what a joiner is shown would always be one person behind.

**The window runs from the host's last heartbeat, not from creation.** Ten
minutes from creation is right for a handshake and wrong for a table that
stays open all game so somebody can arrive on turn nine. A host who closes
the sheet stops beating, and the table goes.

**The no-server path stays per-seat**, and has to: ADR 0004's path 1 is one
offer shown to one scanner, which is inherent to holding a phone up to
somebody. It now asks which seat the code is for rather than being reached
through a seat, and its payload types are its own rather than borrowed from
the signalling port — sharing them only ever made the two paths look like they
carried the same thing.

## Consequences

- The host's job collapses to one screen: a code, a QR, a link, and a list of
  who is in. There is nothing to do per person.
- Late join is free and always was — the same code works on turn nine because
  the offer behind it is fresh every time.
- The worker sees strictly less about a game than it used to in one respect
  and the same in another: no invited player's identity is baked into an
  offer, but the seat list it carries names players so a joiner can pick.
  Still never a life total, never a game event. ADR 0004's trust model holds.
- Joining is two steps rather than one — a code resolves to a table, and the
  joiner picks a seat. That is a step the per-seat design did not have, and it
  is the one that lets a person sit where they are actually sitting.
- Seats a joiner is shown are a snapshot refreshed on the host's heartbeat, so
  they can be a second or two behind. The picker re-reads while it is open, and
  the event log remains the only authority on who holds a seat.
- Four people scanning at once take turns rather than connecting in parallel.
  At a real table this is invisible — a handshake is a second or two — and it
  buys away an entire class of race.
- Cost: six endpoints where there were four, and a host loop with a lifecycle
  (it must be stopped when the sheet closes, or a table it has walked away
  from stays open until its window runs out).

## Revisit if

Tables routinely get big enough that taking turns is noticeable — a pod is six
and a handshake is seconds, so this is an M5 event-scale question rather than a
table-play one. Or if the relay fallback (ADR 0004's path 3) lands, since a
relayed table has a live socket already and would not need to rotate anything.
