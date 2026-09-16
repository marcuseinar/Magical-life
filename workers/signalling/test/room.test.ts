import { env } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';
import type { SeatSummary } from '../src/roomLogic';

const freshRoom = () => env.ROOMS.get(env.ROOMS.newUniqueId());

const seats: readonly SeatSummary[] = [
  { id: 'p1', name: 'Anna', colour: 'green', claimed: false },
  { id: 'p2', name: 'Björn', colour: 'blue', claimed: false }
];

describe('SignallingRoom', () => {
  it('is nothing at all before a table is created', async () => {
    expect(await freshRoom().summary()).toBeNull();
  });

  it('holds the seat list a joiner picks from, and says an offer is free', async () => {
    const room = freshRoom();
    expect(await room.createTable(seats, 'offer-1', 't1')).toBe('created');
    expect(await room.summary()).toEqual({ seats, open: true });
  });

  it('refuses a second table on a code that is still live', async () => {
    const room = freshRoom();
    await room.createTable(seats, 'first', 't1');
    expect(await room.createTable(seats, 'second', 't2')).toBe('taken');
    expect(await room.claim()).toEqual({ sdp: 'first', ticket: 't1' });
  });

  /*
   * The property that lets one code serve a whole table. Two people scanning
   * the same QR in the same instant must not both answer the same SDP — and
   * because only one handshake is ever in flight, they cannot end up in the
   * same seat either.
   */
  it('hands the offer to exactly one claimant', async () => {
    const room = freshRoom();
    await room.createTable(seats, 'offer-1', 't1');

    expect(await room.claim()).toEqual({ sdp: 'offer-1', ticket: 't1' });
    expect(await room.claim()).toBeNull();
    expect(await room.summary()).toEqual({ seats, open: false });
  });

  it('opens again, under the same code, when the host publishes the next offer', async () => {
    const room = freshRoom();
    await room.createTable(seats, 'offer-1', 't1');
    await room.claim();

    const taken: readonly SeatSummary[] = [
      { id: 'p1', name: 'Anna', colour: 'green', claimed: false },
      { id: 'p2', name: 'Björn', colour: 'blue', claimed: true }
    ];
    expect(await room.publishOffer(taken, 'offer-2', 't2')).toBe(true);

    expect(await room.summary()).toEqual({ seats: taken, open: true });
    expect(await room.claim()).toEqual({ sdp: 'offer-2', ticket: 't2' });
  });

  it('accepts an answer bearing the ticket the offer went out with', async () => {
    const room = freshRoom();
    await room.createTable(seats, 'offer-1', 't1');
    await room.claim();

    expect(await room.submitAnswer({ ticket: 't1', sdp: 'answer-1', seatId: 'p2' })).toBe(true);
    expect(await room.takeAnswer(seats)).toEqual({
      found: true,
      answer: { ticket: 't1', sdp: 'answer-1', seatId: 'p2' }
    });
  });

  it('refuses an answer for an offer the host has already replaced', async () => {
    const room = freshRoom();
    await room.createTable(seats, 'offer-1', 't1');
    await room.claim();
    await room.publishOffer(seats, 'offer-2', 't2');

    expect(await room.submitAnswer({ ticket: 't1', sdp: 'late', seatId: 'p2' })).toBe(false);
  });

  it('refuses an answer when nobody has claimed an offer', async () => {
    const room = freshRoom();
    await room.createTable(seats, 'offer-1', 't1');
    expect(await room.submitAnswer({ ticket: 't1', sdp: 'answer-1', seatId: 'p2' })).toBe(false);
  });

  it('is found but empty-handed while nobody is joining', async () => {
    const room = freshRoom();
    await room.createTable(seats, 'offer-1', 't1');
    expect(await room.takeAnswer(seats)).toEqual({ found: true, answer: null });
  });

  /* Read once: the host acts on an answer exactly once, and a second poll
     must not hand it the same joiner again. */
  /* The heartbeat also carries the host's current seat list up, so what a
     joiner is shown does not lag a person behind. */
  it('takes the seat list the host sends with its heartbeat', async () => {
    const room = freshRoom();
    await room.createTable(seats, 'offer-1', 't1');

    const taken: readonly SeatSummary[] = [
      { id: 'p1', name: 'Anna', colour: 'green', claimed: false },
      { id: 'p2', name: 'Björn', colour: 'blue', claimed: true }
    ];
    await room.takeAnswer(taken);

    expect(await room.summary()).toEqual({ seats: taken, open: true });
  });

  it('clears an answer once the host has taken it', async () => {
    const room = freshRoom();
    await room.createTable(seats, 'offer-1', 't1');
    await room.claim();
    await room.submitAnswer({ ticket: 't1', sdp: 'answer-1', seatId: 'p2' });

    await room.takeAnswer(seats);
    expect(await room.takeAnswer(seats)).toEqual({ found: true, answer: null });
  });

  it('cannot be published to, or answered, when there is no table', async () => {
    const room = freshRoom();
    expect(await room.publishOffer(seats, 'offer', 't')).toBe(false);
    expect(await room.takeAnswer(seats)).toEqual({ found: false });
  });
});
