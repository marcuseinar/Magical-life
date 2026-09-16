import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  ROOM_TTL_MS,
  claimOffer,
  isLive,
  publishOffer,
  takeAnswer,
  withAnswer,
  withTable
} from '../src/roomLogic';
import type { SeatSummary, TableRecord } from '../src/roomLogic';

const seats: readonly SeatSummary[] = [
  { id: 'p1', name: 'Anna', colour: 'green', claimed: false },
  { id: 'p2', name: 'Björn', colour: 'blue', claimed: false }
];

const opened = (now = 0): TableRecord => withTable(seats, 'offer-1', 't1', now);

describe('isLive', () => {
  it('is false when there is no record at all', () => {
    expect(isLive(undefined, 0)).toBe(false);
  });

  it('is true anywhere inside the window, false anywhere past it', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: ROOM_TTL_MS }), (elapsed) => {
        expect(isLive(opened(0), elapsed)).toBe(true);
      })
    );
    fc.assert(
      fc.property(fc.integer({ min: ROOM_TTL_MS + 1, max: ROOM_TTL_MS * 50 }), (elapsed) => {
        expect(isLive(opened(0), elapsed)).toBe(false);
      })
    );
  });

  /*
   * A table stays open for a whole game so a fifth player can arrive on turn
   * nine, which the handshake-sized window it replaced could not do. The
   * window runs from the host's last sign of life, not from creation — and
   * it still closes on a host who has walked away.
   */
  it('runs from the last time the host was heard from, not from creation', () => {
    const stale = opened(0);
    expect(isLive(stale, ROOM_TTL_MS + 1)).toBe(false);

    const touched = publishOffer(stale, seats, 'offer-2', 't2', ROOM_TTL_MS);
    expect(isLive(touched, ROOM_TTL_MS + 1)).toBe(true);
    expect(isLive(touched, ROOM_TTL_MS * 2 + 1)).toBe(false);
  });
});

describe('claiming the offer', () => {
  /*
   * The whole reason one code can serve a whole table: the offer is handed to
   * exactly one joiner, so two people scanning the same QR at the same moment
   * cannot both answer the same SDP. It also means only one handshake is ever
   * in flight, which is what stops two joiners taking the same seat.
   */
  it('hands the offer to the first claimant and to nobody after', () => {
    const room = opened();

    const first = claimOffer(room);
    expect(first.claimed).toEqual({ sdp: 'offer-1', ticket: 't1' });

    const second = claimOffer(first.record);
    expect(second.claimed).toBeNull();
    expect(second.record).toEqual(first.record);
  });

  it('is open again once the host publishes the next offer', () => {
    const taken = claimOffer(opened()).record;
    expect(claimOffer(taken).claimed).toBeNull();

    const republished = publishOffer(taken, seats, 'offer-2', 't2', 1_000);
    expect(claimOffer(republished).claimed).toEqual({ sdp: 'offer-2', ticket: 't2' });
  });

  it('reports whether a joiner could join right now, without taking anything', () => {
    const room = opened();
    expect(room.offer).not.toBeNull();
    expect(claimOffer(room).record.offer).toBeNull();
  });
});

describe('answering', () => {
  it('accepts an answer carrying the ticket the offer was handed out with', () => {
    const claimed = claimOffer(opened()).record;
    const answered = withAnswer(claimed, { ticket: 't1', sdp: 'answer-1', seatId: 'p2' });
    expect(answered?.answer).toEqual({ ticket: 't1', sdp: 'answer-1', seatId: 'p2' });
  });

  /* A ticket from a superseded offer means that joiner took too long and the
     host has moved on; accepting it would connect them to a dead peer. */
  it('refuses an answer whose ticket is not the one outstanding', () => {
    const claimed = claimOffer(opened()).record;
    expect(withAnswer(claimed, { ticket: 'stale', sdp: 'a', seatId: 'p2' })).toBeNull();
  });

  it('refuses an answer when no offer has been handed out at all', () => {
    expect(withAnswer(opened(), { ticket: 't1', sdp: 'a', seatId: 'p2' })).toBeNull();
  });

  it('clears the answer once the host has taken it, so it is read once', () => {
    const claimed = claimOffer(opened()).record;
    const answered = withAnswer(claimed, { ticket: 't1', sdp: 'answer-1', seatId: 'p2' })!;

    const taken = takeAnswer(answered, seats, 5_000);
    expect(taken.answer).toEqual({ ticket: 't1', sdp: 'answer-1', seatId: 'p2' });
    expect(takeAnswer(taken.record, seats, 5_000).answer).toBeNull();
  });

  it('counts the host reading for an answer as the host still being there', () => {
    const { record } = takeAnswer(opened(0), seats, ROOM_TTL_MS);
    expect(isLive(record, ROOM_TTL_MS + 1)).toBe(true);
  });
});

describe('the seat list', () => {
  /* The joiner picks a seat before connecting, so the list has to be the
     host's current one — republished with every rotation of the offer. */
  it('is replaced by whatever the host publishes with the next offer', () => {
    const room = opened();
    const nowClaimed: readonly SeatSummary[] = [
      { id: 'p1', name: 'Anna', colour: 'green', claimed: false },
      { id: 'p2', name: 'Björn', colour: 'blue', claimed: true }
    ];

    const next = publishOffer(room, nowClaimed, 'offer-2', 't2', 1_000);
    expect(next.seats).toEqual(nowClaimed);
  });
});
