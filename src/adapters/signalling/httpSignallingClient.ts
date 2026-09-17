import type {
  AnswerPayload,
  ClaimedOffer,
  SeatSummary,
  Signalling,
  TableSummary
} from '$application/ports/signalling';

/** The client half of `workers/signalling/` — see that package's README. */
export function createHttpSignallingClient(baseUrl: string): Signalling {
  const url = (path: string) => `${baseUrl.replace(/\/$/, '')}${path}`;
  const table = (code: string) => url(`/tables/${encodeURIComponent(code)}`);

  const send = (target: string, body?: unknown) =>
    fetch(target, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      ...(body === undefined ? {} : { body: JSON.stringify(body) })
    });

  async function parseJson<T>(res: Response, action: string): Promise<T> {
    if (!res.ok) throw new Error(`${action} failed (${res.status}).`);
    return (await res.json()) as T;
  }

  return {
    async openTable(seats: readonly SeatSummary[], sdp: string) {
      const res = await send(url('/tables'), { sdp, seats });
      return parseJson<{ code: string }>(res, 'Opening a table');
    },

    async lookUp(code) {
      const res = await fetch(table(code));
      if (res.status === 404) return null;
      return parseJson<TableSummary>(res, 'Reading that code');
    },

    async claimOffer(code) {
      const res = await send(`${table(code)}/claim`);
      // 409 is "somebody else is joining right now", 404 "no such table".
      // A joiner waits and retries either way, so they collapse here.
      if (res.status === 409 || res.status === 404) return null;
      return parseJson<ClaimedOffer>(res, 'Joining that table');
    },

    async submitAnswer(code, answer: AnswerPayload) {
      const res = await send(`${table(code)}/answer`, answer);
      if (res.status === 404) return false;
      if (!res.ok) throw new Error(`Answering failed (${res.status}).`);
      return true;
    },

    async poll(code, seats: readonly SeatSummary[]) {
      const res = await send(`${table(code)}/poll`, { seats });
      if (res.status === 404) return { found: false };
      const body = await parseJson<{ answer: AnswerPayload | null }>(res, 'Checking for a reply');
      return { found: true, answer: body.answer };
    },

    async publishOffer(code, seats: readonly SeatSummary[], sdp: string) {
      const res = await send(`${table(code)}/offer`, { sdp, seats });
      if (res.status === 404) return false;
      if (!res.ok) throw new Error(`Reopening the table failed (${res.status}).`);
      return true;
    },

    relayUrl(code: string, ticket: string) {
      const wsUrl = `${table(code)}/relay?ticket=${encodeURIComponent(ticket)}`;
      return wsUrl.replace(/^http/, 'ws');
    }
  };
}
