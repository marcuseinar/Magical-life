import { generateRoomCode } from './codes';
import { SignallingRoom } from './room';
import type { AnswerPayload, SeatSummary } from './roomLogic';

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

const isSeat = (value: unknown): value is SeatSummary =>
  typeof value === 'object' &&
  value !== null &&
  typeof (value as SeatSummary).id === 'string' &&
  typeof (value as SeatSummary).name === 'string' &&
  typeof (value as SeatSummary).colour === 'string' &&
  typeof (value as SeatSummary).claimed === 'boolean';

type SeatsBody = { seats: readonly SeatSummary[] };
type OfferBody = SeatsBody & { sdp: string };

const isSeatsBody = (value: unknown): value is SeatsBody =>
  typeof value === 'object' &&
  value !== null &&
  Array.isArray((value as SeatsBody).seats) &&
  (value as SeatsBody).seats.every(isSeat);

const isOfferBody = (value: unknown): value is OfferBody =>
  isSeatsBody(value) && typeof (value as OfferBody).sdp === 'string';

const isAnswerBody = (value: unknown): value is AnswerPayload =>
  typeof value === 'object' &&
  value !== null &&
  typeof (value as AnswerPayload).sdp === 'string' &&
  typeof (value as AnswerPayload).ticket === 'string' &&
  typeof (value as AnswerPayload).seatId === 'string';

/** Identifies one offer, so a joiner who took too long cannot answer the one
 *  that replaced theirs. Opaque to everyone but the room. */
const newTicket = () => crypto.randomUUID();

const room = (env: Env, code: string) => env.ROOMS.get(env.ROOMS.idFromName(code.toUpperCase()));

async function createTable(request: Request, env: Env, headers: HeadersInit): Promise<Response> {
  const body: unknown = await request.json();
  if (!isOfferBody(body)) return new Response('invalid offer', { status: 400, headers });

  for (let attempt = 0; attempt < MAX_CODE_ATTEMPTS; attempt++) {
    const code = generateRoomCode((n) => crypto.getRandomValues(new Uint8Array(n)));
    const created = await room(env, code).createTable(body.seats, body.sdp, newTicket());
    if (created === 'created') return Response.json({ code }, { headers });
  }
  return new Response('could not allocate a table code', { status: 503, headers });
}

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
      if (root === 'tables' && code === undefined && request.method === 'POST') {
        return await createTable(request, env, headers);
      }

      if (root === 'tables' && code !== undefined && rest.length === 0) {
        const stub = room(env, code);

        // What is at this table, without taking anything from it.
        if (sub === undefined && request.method === 'GET') {
          const summary = await stub.summary();
          if (summary === null) return new Response('not found', { status: 404, headers });
          return Response.json(summary, { headers });
        }

        // Takes the offer off the table — exactly one joiner gets it.
        if (sub === 'claim' && request.method === 'POST') {
          const claimed = await stub.claim();
          if (claimed === null) {
            // Either the table is gone or somebody else is mid-handshake.
            // A joiner is told to try again in a moment either way.
            return new Response('nothing to claim', { status: 409, headers });
          }
          return Response.json(claimed, { headers });
        }

        if (sub === 'answer' && request.method === 'POST') {
          const body: unknown = await request.json();
          if (!isAnswerBody(body)) return new Response('invalid answer', { status: 400, headers });
          const accepted = await stub.submitAnswer(body);
          if (!accepted) return new Response('not found', { status: 404, headers });
          return new Response(null, { status: 204, headers });
        }

        // The host's heartbeat: still here, here is the table as it now
        // stands, and has anybody answered? One call rather than three.
        if (sub === 'poll' && request.method === 'POST') {
          const body: unknown = await request.json();
          if (!isSeatsBody(body)) return new Response('invalid seats', { status: 400, headers });
          const result = await stub.takeAnswer(body.seats);
          if (!result.found) return new Response('not found', { status: 404, headers });
          return Response.json({ answer: result.answer }, { headers });
        }

        // The host putting the next offer out under the same code.
        if (sub === 'offer' && request.method === 'POST') {
          const body: unknown = await request.json();
          if (!isOfferBody(body)) return new Response('invalid offer', { status: 400, headers });
          const published = await stub.publishOffer(body.seats, body.sdp, newTicket());
          if (!published) return new Response('not found', { status: 404, headers });
          return new Response(null, { status: 204, headers });
        }
      }
    } catch {
      return new Response('bad request', { status: 400, headers });
    }

    return new Response('not found', { status: 404, headers });
  }
} satisfies ExportedHandler<Env>;
