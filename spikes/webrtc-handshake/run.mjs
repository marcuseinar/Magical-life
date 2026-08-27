#!/usr/bin/env node
// A throwaway script, not a test suite: it exists to answer one question
// before any of this becomes real, tested code in src/adapters/transport/.
// Run it by hand — `node spikes/webrtc-handshake/run.mjs` — and read the
// report. Nothing here runs in CI and nothing here is asserted against;
// judgement happens by reading the numbers, the way a spike should.
//
// What it proves: two independent browser contexts (standing in for two
// separate devices) can complete a non-trickle WebRTC handshake and open a
// data channel, using only Node to relay the offer/answer strings — the
// role a QR code or a short code will play for real later. What it does
// not prove: real NAT diversity (this is loopback on one machine), actual
// QR encoding or scanning, or the Cloudflare Worker signalling path.

import { chromium } from 'playwright';
import { deflateRawSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const peerScript = join(here, 'peer.mjs');

const chromiumPath = process.env.PLAYWRIGHT_CHROMIUM_PATH;

function kb(bytes) {
  return `${(bytes / 1024).toFixed(2)} kB (${bytes} bytes)`;
}

async function preparePage(context) {
  const page = await context.newPage();
  await page.goto('about:blank');
  await page.addScriptTag({ path: peerScript, type: 'module' });
  await page.waitForFunction(() => window.__peerReady === true);
  return page;
}

async function main() {
  const browser = await chromium.launch(chromiumPath ? { executablePath: chromiumPath } : {});
  const [hostContext, joinContext] = await Promise.all([
    browser.newContext(),
    browser.newContext()
  ]);

  console.log('Launching two independent browser contexts (host, joiner)...\n');

  const [host, joiner] = await Promise.all([preparePage(hostContext), preparePage(joinContext)]);

  const t0 = Date.now();

  // Host creates the offer and waits for ICE gathering to finish — this is
  // the pause a real player would see between "start table" and a QR code
  // actually appearing.
  const offer = await host.evaluate(async () => {
    window.__offerer = window.__peer.offerConnection();
    return window.__offerer.offer;
  });
  const tOffer = Date.now();

  console.log(`Offer SDP:     ${kb(Buffer.byteLength(offer))}`);
  console.log(`  compressed:  ${kb(deflateRawSync(offer).length)}`);
  console.log(`  gathering:   ${tOffer - t0} ms\n`);

  // The offer crosses to the joiner here, in a plain JS string, exactly the
  // payload a QR code or a short code would carry.
  const answer = await joiner.evaluate(async (offerSdp) => {
    window.__answerer = window.__peer.answerConnection(offerSdp);
    return window.__answerer.answer;
  }, offer);
  const tAnswer = Date.now();

  console.log(`Answer SDP:    ${kb(Buffer.byteLength(answer))}`);
  console.log(`  compressed:  ${kb(deflateRawSync(answer).length)}`);
  console.log(`  gathering:   ${tAnswer - tOffer} ms\n`);

  // And the answer crosses back to the host.
  await host.evaluate(async (answerSdp) => {
    await window.__offerer.accept(answerSdp);
  }, answer);

  await Promise.all([
    host.waitForFunction(() => window.__offerer.transport.state === 'connected'),
    joiner.waitForFunction(async () => (await window.__answerer.transport).state === 'connected')
  ]);
  const tConnected = Date.now();

  console.log(`Channel open:  ${tConnected - t0} ms total from a standing start\n`);

  // Prove bytes actually move, each direction, through the real channel.
  const fromHost = { kind: 'life/changed', authorId: 'host', delta: -3 };
  const fromJoiner = { kind: 'life/changed', authorId: 'joiner', delta: -7 };

  await host.evaluate((payload) => window.__offerer.transport.send(payload), fromHost);
  await joiner.evaluate(async (payload) => {
    (await window.__answerer.transport).send(payload);
  }, fromJoiner);

  const joinerSaw = await joiner.waitForFunction(
    () => window.__answerer.transport.then((t) => t.received[0]),
    null,
    { polling: 100 }
  );
  const hostSaw = await host.waitForFunction(
    () => window.__offerer.transport.received[0],
    null,
    { polling: 100 }
  );

  console.log('Joiner received from host:', await joinerSaw.jsonValue());
  console.log('Host received from joiner:', await hostSaw.jsonValue());

  const ok =
    JSON.stringify(await joinerSaw.jsonValue()) === JSON.stringify(fromHost) &&
    JSON.stringify(await hostSaw.jsonValue()) === JSON.stringify(fromJoiner);

  console.log(`\n${ok ? 'PASS' : 'FAIL'} — each side received exactly what the other sent.`);

  await browser.close();
  process.exit(ok ? 0 : 1);
}

main().catch((error) => {
  console.error('Spike failed to run at all:', error);
  process.exit(1);
});
