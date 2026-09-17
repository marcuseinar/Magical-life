import { exports } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';

/*
 * The relay fallback (ADR 0004, path 3): a plain WebSocket, paired by
 * ticket, run against the real Workers runtime the same way worker.test.ts
 * proves the offer/answer exchange — no browser and no real WebRTC needed,
 * since this is the one path in `docs/design/multiplayer.md` that never
 * touches either.
 */

const ORIGIN = 'http://localhost:5173';

function upgradeRequest(path: string, origin = ORIGIN): Request {
  return new Request(`https://signalling.example${path}`, {
    headers: { Origin: origin, Upgrade: 'websocket' }
  });
}

async function connect(path: string): Promise<WebSocket> {
  const res = await exports.default.fetch(upgradeRequest(path));
  expect(res.status).toBe(101);
  const ws = res.webSocket;
  if (ws === null) throw new Error('expected a websocket');
  ws.accept();
  return ws;
}

function nextMessage(ws: WebSocket): Promise<string> {
  return new Promise((resolve) => {
    ws.addEventListener('message', (event) => resolve(event.data as string), { once: true });
  });
}

function nextClose(ws: WebSocket): Promise<void> {
  return new Promise((resolve) => {
    ws.addEventListener('close', () => resolve(), { once: true });
  });
}

describe('the relay fallback', () => {
  it('relays messages between two sockets sharing a ticket, in both directions', async () => {
    const host = await connect('/tables/ABCD/relay?ticket=t1');
    const joiner = await connect('/tables/ABCD/relay?ticket=t1');

    host.send('hello from host');
    expect(await nextMessage(joiner)).toBe('hello from host');

    joiner.send('hello from joiner');
    expect(await nextMessage(host)).toBe('hello from joiner');
  });

  it('never relays between different tickets, even under the same code', async () => {
    const a = await connect('/tables/ABCD/relay?ticket=t1');
    const b = await connect('/tables/ABCD/relay?ticket=t2');
    let received: string | null = null;
    b.addEventListener('message', (event) => (received = event.data as string));

    a.send('should not arrive');
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(received).toBeNull();
  });

  it('never relays between different codes, even under the same ticket', async () => {
    const a = await connect('/tables/ABCD/relay?ticket=t1');
    const b = await connect('/tables/ZZZZ/relay?ticket=t1');
    let received: string | null = null;
    b.addEventListener('message', (event) => (received = event.data as string));

    a.send('should not arrive');
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(received).toBeNull();
  });

  it('closes the other side the moment either one closes — a pair is one link', async () => {
    const host = await connect('/tables/ABCD/relay?ticket=t1');
    const joiner = await connect('/tables/ABCD/relay?ticket=t1');

    const closed = nextClose(joiner);
    host.close();
    await closed;
  });

  it('rejects a relay request with no ticket, or that is not an upgrade at all', async () => {
    const noTicket = await exports.default.fetch(
      new Request('https://signalling.example/tables/ABCD/relay', { headers: { Origin: ORIGIN } })
    );
    expect(noTicket.status).toBe(400);

    const notAnUpgrade = await exports.default.fetch(
      new Request('https://signalling.example/tables/ABCD/relay?ticket=t1', {
        headers: { Origin: ORIGIN }
      })
    );
    expect(notAnUpgrade.status).toBe(400);
  });

  it('refuses an origin outside the allow-list before ever touching the room', async () => {
    const res = await exports.default.fetch(
      upgradeRequest('/tables/ABCD/relay?ticket=t1', 'https://evil.example')
    );
    expect(res.status).toBe(403);
  });
});
