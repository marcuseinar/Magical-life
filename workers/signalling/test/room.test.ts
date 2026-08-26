import { env } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';

function freshRoom() {
  return env.ROOMS.get(env.ROOMS.newUniqueId());
}

describe('SignallingRoom', () => {
  it('has no offer before one is created', async () => {
    const room = freshRoom();
    expect(await room.getOffer()).toBeNull();
  });

  it('accepts the first offer and reports it back unchanged', async () => {
    const room = freshRoom();
    expect(
      await room.createOffer({
        sdp: 'offer-sdp',
        invitePlayerId: 'p2',
        invitePlayerName: 'Player 2'
      })
    ).toBe('created');
    expect(await room.getOffer()).toEqual({
      sdp: 'offer-sdp',
      invitePlayerId: 'p2',
      invitePlayerName: 'Player 2'
    });
  });

  it('refuses a second offer while the room is still live', async () => {
    const room = freshRoom();
    await room.createOffer({ sdp: 'first', invitePlayerId: 'p2', invitePlayerName: 'Player 2' });
    expect(
      await room.createOffer({ sdp: 'second', invitePlayerId: 'p3', invitePlayerName: 'Player 3' })
    ).toBe('taken');
    expect(await room.getOffer()).toEqual({
      sdp: 'first',
      invitePlayerId: 'p2',
      invitePlayerName: 'Player 2'
    });
  });

  it('has no answer, but is found, once an offer exists', async () => {
    const room = freshRoom();
    await room.createOffer({
      sdp: 'offer-sdp',
      invitePlayerId: 'p2',
      invitePlayerName: 'Player 2'
    });
    expect(await room.getAnswer()).toEqual({ found: true, answer: null });
  });

  it('accepts an answer once an offer exists, and returns it afterwards', async () => {
    const room = freshRoom();
    await room.createOffer({
      sdp: 'offer-sdp',
      invitePlayerId: 'p2',
      invitePlayerName: 'Player 2'
    });
    expect(await room.submitAnswer({ sdp: 'answer-sdp' })).toBe(true);
    expect(await room.getAnswer()).toEqual({ found: true, answer: { sdp: 'answer-sdp' } });
  });

  it('refuses an answer for a room that was never offered', async () => {
    const room = freshRoom();
    expect(await room.submitAnswer({ sdp: 'answer-sdp' })).toBe(false);
    expect(await room.getAnswer()).toEqual({ found: false });
  });
});
