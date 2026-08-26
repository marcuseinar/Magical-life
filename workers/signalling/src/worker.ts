import { generateRoomCode } from './codes';
import { SignallingRoom } from './room';
import type { AnswerPayload, OfferPayload } from './roomLogic';

export { SignallingRoom };

/** A code collides with a still-live room roughly once in ~1M attempts at
 *  length 4 — this exists for that, not for load. */
const MAX_CODE_ATTEMPTS = 8;

function corsHeaders(request: Request, env: Env): HeadersInit {
  const origin = request.headers.get('Origin') ?? '';
  const allowed = env.ALLOWED_ORIGINS.split(',').map((entry) => entry.trim());
  return {
    'Access-Control-Allow-Origin': allowed.includes(origin) ? origin : (allowed[0] ?? ''),
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    Vary: 'Origin'
  };
}

function isOfferPayload(value: unknown): value is OfferPayload {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as OfferPayload).sdp === 'string' &&
    typeof (value as OfferPayload).invitePlayerId === 'string' &&
    typeof (value as OfferPayload).invitePlayerName === 'string'
  );
}

function isAnswerPayload(value: unknown): value is AnswerPayload {
  return (
    typeof value === 'object' && value !== null && typeof (value as AnswerPayload).sdp === 'string'
  );
}

async function createRoom(request: Request, env: Env, headers: HeadersInit): Promise<Response> {
  const body: unknown = await request.json();
  if (!isOfferPayload(body)) return new Response('invalid offer', { status: 400, headers });

  for (let attempt = 0; attempt < MAX_CODE_ATTEMPTS; attempt++) {
    const code = generateRoomCode((n) => crypto.getRandomValues(new Uint8Array(n)));
    const stub = env.ROOMS.get(env.ROOMS.idFromName(code));
    if ((await stub.createOffer(body)) === 'created') {
      return Response.json({ code }, { headers });
    }
  }
  return new Response('could not allocate a room code', { status: 503, headers });
}

async function getOffer(env: Env, code: string, headers: HeadersInit): Promise<Response> {
  const stub = env.ROOMS.get(env.ROOMS.idFromName(code.toUpperCase()));
  const offer = await stub.getOffer();
  if (offer === null) return new Response('not found', { status: 404, headers });
  return Response.json({ offer }, { headers });
}

async function postAnswer(
  request: Request,
  env: Env,
  code: string,
  headers: HeadersInit
): Promise<Response> {
  const body: unknown = await request.json();
  if (!isAnswerPayload(body)) return new Response('invalid answer', { status: 400, headers });

  const stub = env.ROOMS.get(env.ROOMS.idFromName(code.toUpperCase()));
  const accepted = await stub.submitAnswer(body);
  if (!accepted) return new Response('not found', { status: 404, headers });
  return new Response(null, { status: 204, headers });
}

async function getAnswer(env: Env, code: string, headers: HeadersInit): Promise<Response> {
  const stub = env.ROOMS.get(env.ROOMS.idFromName(code.toUpperCase()));
  const result = await stub.getAnswer();
  if (!result.found) return new Response('not found', { status: 404, headers });
  return Response.json({ answer: result.answer }, { headers });
}

/**
 * `GET  /health`             — for a deploy check or a local dev server to
 *                              poll, not for a client to call
 * `POST /rooms`             — host offers a table, gets back a short code
 * `GET  /rooms/:code`       — joiner reads the offer for a code
 * `POST /rooms/:code/answer`— joiner posts their answer
 * `GET  /rooms/:code/answer`— host polls for the answer
 *
 * Sees only opaque SDP blobs and player names volunteered for the invite —
 * never a game event. See docs/design/multiplayer.md's trust model.
 */
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const headers = corsHeaders(request, env);
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers });

    const url = new URL(request.url);
    const [root, code, sub, ...rest] = url.pathname.split('/').filter(Boolean);

    if (root === 'health' && code === undefined && request.method === 'GET') {
      return new Response('ok', { headers });
    }

    try {
      if (root === 'rooms' && code === undefined && request.method === 'POST') {
        return await createRoom(request, env, headers);
      }
      if (root === 'rooms' && code !== undefined && sub === undefined && request.method === 'GET') {
        return await getOffer(env, code, headers);
      }
      if (root === 'rooms' && code !== undefined && sub === 'answer' && rest.length === 0) {
        if (request.method === 'POST') return await postAnswer(request, env, code, headers);
        if (request.method === 'GET') return await getAnswer(env, code, headers);
      }
    } catch {
      return new Response('bad request', { status: 400, headers });
    }

    return new Response('not found', { status: 404, headers });
  }
} satisfies ExportedHandler<Env>;
