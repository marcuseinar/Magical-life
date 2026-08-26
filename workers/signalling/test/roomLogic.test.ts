import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { ROOM_TTL_MS, isLive, withAnswer, withOffer } from '../src/roomLogic';
import type { AnswerPayload, OfferPayload } from '../src/roomLogic';

const anOffer: OfferPayload = {
  sdp: 'offer-sdp',
  invitePlayerId: 'p2',
  invitePlayerName: 'Player 2'
};
const anAnswer: AnswerPayload = { sdp: 'answer-sdp' };

describe('isLive', () => {
  it('is false when there is no record at all', () => {
    expect(isLive(undefined, 0)).toBe(false);
  });

  it('is true at the moment of creation', () => {
    const record = withOffer(anOffer, 1_000);
    expect(isLive(record, 1_000)).toBe(true);
  });

  it('is true anywhere inside the TTL window, false anywhere past it', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: ROOM_TTL_MS }), (elapsed) => {
        const record = withOffer(anOffer, 0);
        expect(isLive(record, elapsed)).toBe(true);
      })
    );
    fc.assert(
      fc.property(fc.integer({ min: ROOM_TTL_MS + 1, max: ROOM_TTL_MS * 100 }), (elapsed) => {
        const record = withOffer(anOffer, 0);
        expect(isLive(record, elapsed)).toBe(false);
      })
    );
  });
});

describe('withOffer', () => {
  it('starts with no answer', () => {
    expect(withOffer(anOffer, 0).answer).toBeNull();
  });

  it('carries the offer and the creation time through unchanged', () => {
    fc.assert(
      fc.property(fc.integer(), (now) => {
        const record = withOffer(anOffer, now);
        expect(record.offer).toEqual(anOffer);
        expect(record.createdAt).toBe(now);
      })
    );
  });
});

describe('withAnswer', () => {
  it('attaches the answer without disturbing the offer or the creation time', () => {
    const record = withOffer(anOffer, 42);
    const answered = withAnswer(record, anAnswer);
    expect(answered.answer).toEqual(anAnswer);
    expect(answered.offer).toEqual(anOffer);
    expect(answered.createdAt).toBe(42);
  });
});
