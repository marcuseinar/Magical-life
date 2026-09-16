import { exports } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';
import type { SeatSummary } from '../src/roomLogic';

const ORIGIN = 'http://localhost:5173';

const seats: readonly SeatSummary[] = [
  { id: 'p1', name: 'Anna', colour: 'green', claimed: false },
  { id: 'p2', name: 'Björn', colour: 'blue', claimed: false }
];

function request(path: string, init: RequestInit = {}): Request {
  return new Request(`https://signalling.example${path}`, {
    ...init,
    headers: { Origin: ORIGIN, ...(init.headers ?? {}) }
  });
}

const call = (path: string, init?: RequestInit) => exports.default.fetch(request(path, init));

const post = (path: string, body: unknown) =>
  call(path, { method: 'POST', body: JSON.stringify(body) });

async function openTable(sdp = 'offer-1'): Promise<string> {
  const res = await post('/tables', { sdp, seats });
  const { code } = (await res.json()) as { code: string };
  return code;
}

describe('the signalling worker', () => {
  it('answers /health for a deploy or local-dev check', async () => {
    expect((await call('/health')).status).toBe(200);
  });

  it('opens a table and returns a four-character code', async () => {
    const res = await post('/tables', { sdp: 'offer-1', seats });
    expect(res.status).toBe(200);
    const { code } = (await res.json()) as { code: string };
    expect(code).toMatch(/^[A-Z0-9]{4}$/);
  });

  it('rejects opening a table with a malformed body', async () => {
    expect((await post('/tables', {})).status).toBe(400);
    expect((await post('/tables', { sdp: 'x' })).status).toBe(400);
    expect((await post('/tables', { sdp: 'x', seats: [{ id: 'p1' }] })).status).toBe(400);
  });

  it('reflects an allowed origin and echoes it in Vary', async () => {
    const res = await post('/tables', { sdp: 'x', seats });
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe(ORIGIN);
    expect(res.headers.get('Vary')).toBe('Origin');
  });

  it('answers 404 for a code nobody has opened', async () => {
    expect((await call('/tables/ZZZZ')).status).toBe(404);
  });

  it('shows a joiner the seats and that a place is free, without taking it', async () => {
    const code = await openTable();

    const res = await call(`/tables/${code}`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ seats, open: true });

    // Looking did not consume the offer.
    expect((await post(`/tables/${code}/claim`, {})).status).toBe(200);
  });

  /* One code, one QR, one link — and still only one joiner per handshake. */
  it('gives the offer to the first claimant and turns the next one away', async () => {
    const code = await openTable('offer-1');

    const first = await post(`/tables/${code}/claim`, {});
    expect(first.status).toBe(200);
    expect(await first.json()).toEqual({ sdp: 'offer-1', ticket: expect.any(String) });

    expect((await post(`/tables/${code}/claim`, {})).status).toBe(409);
    expect(await (await call(`/tables/${code}`)).json()).toEqual({ seats, open: false });
  });

  it('carries a whole joiner through, then reopens under the same code', async () => {
    const code = await openTable('offer-1');

    const { ticket } = (await (await post(`/tables/${code}/claim`, {})).json()) as {
      ticket: string;
    };

    expect(await (await post(`/tables/${code}/poll`, { seats })).json()).toEqual({ answer: null });

    const posted = await post(`/tables/${code}/answer`, {
      ticket,
      sdp: 'answer-1',
      seatId: 'p2'
    });
    expect(posted.status).toBe(204);

    const collected = await post(`/tables/${code}/poll`, { seats });
    expect(await collected.json()).toEqual({
      answer: { ticket, sdp: 'answer-1', seatId: 'p2' }
    });

    // The host connects them, then puts the next offer out — same code.
    const taken: readonly SeatSummary[] = [
      { id: 'p1', name: 'Anna', colour: 'green', claimed: false },
      { id: 'p2', name: 'Björn', colour: 'blue', claimed: true }
    ];
    expect((await post(`/tables/${code}/offer`, { sdp: 'offer-2', seats: taken })).status).toBe(
      204
    );

    expect(await (await call(`/tables/${code}`)).json()).toEqual({ seats: taken, open: true });
    const second = await post(`/tables/${code}/claim`, {});
    expect(await second.json()).toEqual({ sdp: 'offer-2', ticket: expect.any(String) });
  });

  it('refuses an answer bearing a ticket the host has moved past', async () => {
    const code = await openTable();
    const { ticket } = (await (await post(`/tables/${code}/claim`, {})).json()) as {
      ticket: string;
    };
    await post(`/tables/${code}/offer`, { sdp: 'offer-2', seats });

    const late = await post(`/tables/${code}/answer`, { ticket, sdp: 'late', seatId: 'p2' });
    expect(late.status).toBe(404);
  });

  it('rejects a malformed answer', async () => {
    const code = await openTable();
    await post(`/tables/${code}/claim`, {});
    expect((await post(`/tables/${code}/answer`, { sdp: 'x' })).status).toBe(400);
  });

  it('answers 404 across the board for a code nobody has opened', async () => {
    expect((await post('/tables/ZZZZ/claim', {})).status).toBe(409);
    expect(
      (await post('/tables/ZZZZ/answer', { ticket: 't', sdp: 'x', seatId: 'p1' })).status
    ).toBe(404);
    expect((await post('/tables/ZZZZ/poll', { seats })).status).toBe(404);
    expect((await post('/tables/ZZZZ/offer', { sdp: 'x', seats })).status).toBe(404);
  });
});
