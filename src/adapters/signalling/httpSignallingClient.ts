import type { AnswerPayload, OfferPayload, Signalling } from '$application/ports/signalling';

/** The client half of `workers/signalling/` — see that package's README. */
export function createHttpSignallingClient(baseUrl: string): Signalling {
  const url = (path: string) => `${baseUrl.replace(/\/$/, '')}${path}`;

  async function parseJson<T>(res: Response, action: string): Promise<T> {
    if (!res.ok) throw new Error(`${action} failed (${res.status}).`);
    return (await res.json()) as T;
  }

  return {
    async createRoom(offer: OfferPayload) {
      const res = await fetch(url('/rooms'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(offer)
      });
      return parseJson<{ code: string }>(res, 'Creating a table');
    },

    async getOffer(code) {
      const res = await fetch(url(`/rooms/${encodeURIComponent(code)}`));
      if (res.status === 404) return null;
      const body = await parseJson<{ offer: OfferPayload }>(res, 'Reading that code');
      return body.offer;
    },

    async submitAnswer(code, answer: AnswerPayload) {
      const res = await fetch(url(`/rooms/${encodeURIComponent(code)}/answer`), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(answer)
      });
      if (res.status === 404) return false;
      if (!res.ok) throw new Error(`Answering failed (${res.status}).`);
      return true;
    },

    async getAnswer(code) {
      const res = await fetch(url(`/rooms/${encodeURIComponent(code)}/answer`));
      if (res.status === 404) return { found: false };
      const body = await parseJson<{ answer: AnswerPayload | null }>(res, 'Checking for a reply');
      return { found: true, answer: body.answer };
    }
  };
}
