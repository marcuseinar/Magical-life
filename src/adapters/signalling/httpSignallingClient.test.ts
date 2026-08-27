import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createHttpSignallingClient } from './httpSignallingClient';

const jsonResponse = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

describe('createHttpSignallingClient', () => {
  const fetchMock = vi.fn<typeof fetch>();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('posts the offer to /rooms and returns the code', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ code: 'ABCD' }));
    const client = createHttpSignallingClient('https://signalling.example');

    const result = await client.createRoom({
      sdp: 'x',
      invitePlayerId: 'p2',
      invitePlayerName: 'Player 2'
    });

    expect(result).toEqual({ code: 'ABCD' });
    const [requestUrl, init] = fetchMock.mock.calls[0]!;
    expect(requestUrl).toBe('https://signalling.example/rooms');
    expect(init?.method).toBe('POST');
    expect(JSON.parse(init?.body as string)).toEqual({
      sdp: 'x',
      invitePlayerId: 'p2',
      invitePlayerName: 'Player 2'
    });
  });

  it('trims a trailing slash from the base URL', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ code: 'ABCD' }));
    const client = createHttpSignallingClient('https://signalling.example/');

    await client.createRoom({ sdp: 'x', invitePlayerId: 'p2', invitePlayerName: 'Player 2' });

    expect(fetchMock.mock.calls[0]![0]).toBe('https://signalling.example/rooms');
  });

  it('rejects when the worker reports failure', async () => {
    fetchMock.mockResolvedValueOnce(new Response('nope', { status: 503 }));
    const client = createHttpSignallingClient('https://signalling.example');

    await expect(
      client.createRoom({ sdp: 'x', invitePlayerId: 'p2', invitePlayerName: 'Player 2' })
    ).rejects.toThrow(/503/);
  });

  it('reads the offer for a code', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ offer: { sdp: 'x', invitePlayerId: 'p2', invitePlayerName: 'Player 2' } })
    );
    const client = createHttpSignallingClient('https://signalling.example');

    const offer = await client.getOffer('ABCD');

    expect(offer).toEqual({ sdp: 'x', invitePlayerId: 'p2', invitePlayerName: 'Player 2' });
    expect(fetchMock.mock.calls[0]![0]).toBe('https://signalling.example/rooms/ABCD');
  });

  it('returns null, not an error, for a code nobody has offered', async () => {
    fetchMock.mockResolvedValueOnce(new Response('not found', { status: 404 }));
    const client = createHttpSignallingClient('https://signalling.example');

    expect(await client.getOffer('ZZZZ')).toBeNull();
  });

  it('posts an answer and reports acceptance', async () => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 204 }));
    const client = createHttpSignallingClient('https://signalling.example');

    const accepted = await client.submitAnswer('ABCD', { sdp: 'y' });

    expect(accepted).toBe(true);
    const [requestUrl, init] = fetchMock.mock.calls[0]!;
    expect(requestUrl).toBe('https://signalling.example/rooms/ABCD/answer');
    expect(init?.method).toBe('POST');
    expect(JSON.parse(init?.body as string)).toEqual({ sdp: 'y' });
  });

  it('reports false, not an error, when the room for an answer is gone', async () => {
    fetchMock.mockResolvedValueOnce(new Response('not found', { status: 404 }));
    const client = createHttpSignallingClient('https://signalling.example');

    expect(await client.submitAnswer('ZZZZ', { sdp: 'y' })).toBe(false);
  });

  it('distinguishes "still waiting" from "room is gone" when polling for an answer', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ answer: null }));
    const client = createHttpSignallingClient('https://signalling.example');
    expect(await client.getAnswer('ABCD')).toEqual({ found: true, answer: null });

    fetchMock.mockResolvedValueOnce(new Response('not found', { status: 404 }));
    expect(await client.getAnswer('ZZZZ')).toEqual({ found: false });

    fetchMock.mockResolvedValueOnce(jsonResponse({ answer: { sdp: 'y' } }));
    expect(await client.getAnswer('ABCD')).toEqual({ found: true, answer: { sdp: 'y' } });
  });
});
