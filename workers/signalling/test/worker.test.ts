import { exports } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';

const ORIGIN = 'http://localhost:5173';

function request(path: string, init: RequestInit = {}): Request {
  return new Request(`https://signalling.example${path}`, {
    ...init,
    headers: { Origin: ORIGIN, ...(init.headers ?? {}) }
  });
}

describe('the signalling worker', () => {
  it('answers /health for a deploy or local-dev check', async () => {
    const res = await exports.default.fetch(request('/health'));
    expect(res.status).toBe(200);
  });

  it('creates a room and returns a four-character code', async () => {
    const res = await exports.default.fetch(
      request('/rooms', {
        method: 'POST',
        body: JSON.stringify({
          sdp: 'offer-sdp',
          invitePlayerId: 'p2',
          invitePlayerName: 'Player 2'
        })
      })
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { code: string };
    expect(body.code).toMatch(/^[A-Z0-9]{4}$/);
  });

  it('rejects a request to create a room with a malformed offer', async () => {
    const res = await exports.default.fetch(
      request('/rooms', { method: 'POST', body: JSON.stringify({}) })
    );
    expect(res.status).toBe(400);
  });

  it('reflects an allowed origin and echoes it in Vary', async () => {
    const res = await exports.default.fetch(
      request('/rooms', {
        method: 'POST',
        body: JSON.stringify({ sdp: 'x', invitePlayerId: 'p2', invitePlayerName: 'Player 2' })
      })
    );
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe(ORIGIN);
    expect(res.headers.get('Vary')).toBe('Origin');
  });

  it('answers 404 for a code nobody has offered', async () => {
    const res = await exports.default.fetch(request('/rooms/ZZZZ'));
    expect(res.status).toBe(404);
  });

  it('carries an offer from creation through to a joiner reading it by code', async () => {
    const createRes = await exports.default.fetch(
      request('/rooms', {
        method: 'POST',
        body: JSON.stringify({
          sdp: 'offer-sdp',
          invitePlayerId: 'p2',
          invitePlayerName: 'Player 2'
        })
      })
    );
    const { code } = (await createRes.json()) as { code: string };

    const readRes = await exports.default.fetch(request(`/rooms/${code}`));
    expect(readRes.status).toBe(200);
    expect(await readRes.json()).toEqual({
      offer: { sdp: 'offer-sdp', invitePlayerId: 'p2', invitePlayerName: 'Player 2' }
    });
  });

  it('carries an answer from the joiner back to the host polling for it', async () => {
    const createRes = await exports.default.fetch(
      request('/rooms', {
        method: 'POST',
        body: JSON.stringify({
          sdp: 'offer-sdp',
          invitePlayerId: 'p2',
          invitePlayerName: 'Player 2'
        })
      })
    );
    const { code } = (await createRes.json()) as { code: string };

    const beforeAnswer = await exports.default.fetch(request(`/rooms/${code}/answer`));
    expect(await beforeAnswer.json()).toEqual({ answer: null });

    const postRes = await exports.default.fetch(
      request(`/rooms/${code}/answer`, {
        method: 'POST',
        body: JSON.stringify({ sdp: 'answer-sdp' })
      })
    );
    expect(postRes.status).toBe(204);

    const afterAnswer = await exports.default.fetch(request(`/rooms/${code}/answer`));
    expect(await afterAnswer.json()).toEqual({ answer: { sdp: 'answer-sdp' } });
  });

  it('answers 404 for an answer posted to a code nobody has offered', async () => {
    const res = await exports.default.fetch(
      request('/rooms/ZZZZ/answer', { method: 'POST', body: JSON.stringify({ sdp: 'x' }) })
    );
    expect(res.status).toBe(404);
  });
});
