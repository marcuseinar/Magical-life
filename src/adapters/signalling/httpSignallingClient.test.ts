import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createHttpSignallingClient } from './httpSignallingClient';
import type { SeatSummary } from '$application/ports/signalling';

const jsonResponse = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

const seats: readonly SeatSummary[] = [
  { id: 'p1', name: 'Anna', colour: 'green', claimed: false },
  { id: 'p2', name: 'Björn', colour: 'blue', claimed: true }
];

describe('createHttpSignallingClient', () => {
  const fetchMock = vi.fn<typeof fetch>();
  const client = () => createHttpSignallingClient('https://signalling.example');

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('opens a table with its seats and returns the one code for it', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ code: 'ABCD' }));

    expect(await client().openTable(seats, 'x')).toEqual({ code: 'ABCD' });

    const [requestUrl, init] = fetchMock.mock.calls[0]!;
    expect(requestUrl).toBe('https://signalling.example/tables');
    expect(init?.method).toBe('POST');
    expect(JSON.parse(init?.body as string)).toEqual({ sdp: 'x', seats });
  });

  it('trims a trailing slash from the base URL', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ code: 'ABCD' }));
    await createHttpSignallingClient('https://signalling.example/').openTable(seats, 'x');
    expect(fetchMock.mock.calls[0]![0]).toBe('https://signalling.example/tables');
  });

  it('reads a table without taking the place on it', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ seats, open: true }));

    expect(await client().lookUp('ABCD')).toEqual({ seats, open: true });
    expect(fetchMock.mock.calls[0]![0]).toBe('https://signalling.example/tables/ABCD');
    expect(fetchMock.mock.calls[0]![1]?.method).toBeUndefined();
  });

  it('returns null, not an error, for a code nobody has opened', async () => {
    fetchMock.mockResolvedValueOnce(new Response('not found', { status: 404 }));
    expect(await client().lookUp('ZZZZ')).toBeNull();
  });

  it('claims the offer and comes back with the ticket that answers it', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ sdp: 'offer', ticket: 't1' }));

    expect(await client().claimOffer('ABCD')).toEqual({ sdp: 'offer', ticket: 't1' });
    expect(fetchMock.mock.calls[0]![0]).toBe('https://signalling.example/tables/ABCD/claim');
    expect(fetchMock.mock.calls[0]![1]?.method).toBe('POST');
  });

  /*
   * 409 is "somebody else is joining right now" and 404 is "no such table".
   * A joiner waits and looks again either way, so the adapter does not make
   * them tell the difference.
   */
  it('returns null when there is no place free to take, whichever reason', async () => {
    fetchMock.mockResolvedValueOnce(new Response('busy', { status: 409 }));
    expect(await client().claimOffer('ABCD')).toBeNull();

    fetchMock.mockResolvedValueOnce(new Response('not found', { status: 404 }));
    expect(await client().claimOffer('ZZZZ')).toBeNull();
  });

  it('posts an answer with its ticket and the seat picked', async () => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 204 }));

    const accepted = await client().submitAnswer('ABCD', {
      ticket: 't1',
      sdp: 'y',
      seatId: 'p2'
    });

    expect(accepted).toBe(true);
    const [requestUrl, init] = fetchMock.mock.calls[0]!;
    expect(requestUrl).toBe('https://signalling.example/tables/ABCD/answer');
    expect(JSON.parse(init?.body as string)).toEqual({ ticket: 't1', sdp: 'y', seatId: 'p2' });
  });

  it('reports false, not an error, when the table for an answer is gone', async () => {
    fetchMock.mockResolvedValueOnce(new Response('not found', { status: 404 }));
    expect(await client().submitAnswer('ZZZZ', { ticket: 't1', sdp: 'y', seatId: 'p2' })).toBe(
      false
    );
  });

  it('distinguishes "nobody joining" from "table is gone" when polling', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ answer: null }));
    expect(await client().poll('ABCD', seats)).toEqual({ found: true, answer: null });

    fetchMock.mockResolvedValueOnce(new Response('not found', { status: 404 }));
    expect(await client().poll('ZZZZ', seats)).toEqual({ found: false });

    const answer = { ticket: 't1', sdp: 'y', seatId: 'p2' };
    fetchMock.mockResolvedValueOnce(jsonResponse({ answer }));
    expect(await client().poll('ABCD', seats)).toEqual({ found: true, answer });
  });

  it('sends the host seat list up with every heartbeat', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ answer: null }));
    await client().poll('ABCD', seats);

    const [requestUrl, init] = fetchMock.mock.calls[0]!;
    expect(requestUrl).toBe('https://signalling.example/tables/ABCD/poll');
    expect(init?.method).toBe('POST');
    expect(JSON.parse(init?.body as string)).toEqual({ seats });
  });

  it('publishes the next offer under the same code, with the seats as they now are', async () => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 204 }));

    expect(await client().publishOffer('ABCD', seats, 'offer-2')).toBe(true);
    const [requestUrl, init] = fetchMock.mock.calls[0]!;
    expect(requestUrl).toBe('https://signalling.example/tables/ABCD/offer');
    expect(JSON.parse(init?.body as string)).toEqual({ sdp: 'offer-2', seats });
  });

  it('reports false when publishing to a table that has gone', async () => {
    fetchMock.mockResolvedValueOnce(new Response('not found', { status: 404 }));
    expect(await client().publishOffer('ZZZZ', seats, 'offer-2')).toBe(false);
  });
});
