#!/usr/bin/env node
// The raw diagnostic behind the "needs a timeout" finding in README.md — run
// this if the numbers there ever need re-checking. It creates one offer and
// logs every ICE event for five seconds without ever calling
// setRemoteDescription, so nothing here depends on a second peer.
import { chromium } from 'playwright';

const browser = await chromium.launch({
  executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH
});
const page = await browser.newPage();
await page.goto('about:blank');

const result = await page.evaluate(async () => {
  const pc = new RTCPeerConnection({ iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] });
  pc.createDataChannel('x');
  const events = [];
  pc.addEventListener('icegatheringstatechange', () => events.push(pc.iceGatheringState));
  pc.addEventListener('icecandidate', (event) =>
    events.push('candidate: ' + (event.candidate ? event.candidate.candidate : 'null (end-of-candidates)'))
  );
  await pc.setLocalDescription(await pc.createOffer());
  await new Promise((resolve) => setTimeout(resolve, 5000));
  return { gatheringStateAfter5s: pc.iceGatheringState, events };
});

console.log(JSON.stringify(result, null, 2));
await browser.close();
