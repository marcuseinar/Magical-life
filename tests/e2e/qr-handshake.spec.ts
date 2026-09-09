import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import qrcode from 'qrcode-generator';
import { startGame } from './support';

/*
 * ADR 0004's path 1 — no server, offer and answer carried in a QR code —
 * proven against the real `CameraQrScanner` adapter: real `getUserMedia`,
 * real `<video>` playback, real `drawImage`/`getImageData` frame reads, real
 * `jsQR` decoding. The one thing standing in for hardware is the camera
 * itself, which no CI runner or sandbox has: `getUserMedia` is replaced with
 * a canvas continuously redrawing a code as black/white modules, captured as
 * a genuine `MediaStream` via `canvas.captureStream()`. Everything
 * downstream of that call — the whole point of this test — is the
 * adapter's own unmodified code.
 *
 * These use a short, fabricated-but-validly-shaped offer/reply rather than
 * a real WebRTC one. A real offer's SDP, base64'd and JSON-wrapped by
 * `connectionCode.ts` with no compression (a deliberate choice there, for
 * paste-friendliness), lands around 950-1000 characters — a QR dense enough
 * (~117 modules) that decoding it back through a *synthesised* video frame
 * turned out to need an impractically large canvas to survive the
 * capture-and-replay round trip reliably, a resolution loss real camera
 * hardware and jsQR are not usually this exposed to. That density is a
 * property of the existing text encoding, not of scanning, and is already
 * covered by `table-connection.spec.ts`'s paste-based journey end to end;
 * what these tests need to prove is that a decoded string reaches the same
 * acceptance path pasting does, which a short fixture does just as well
 * without fighting video-encoder resolution loss to get there.
 *
 * Chromium only: `canvas.captureStream()` and this `getUserMedia` override
 * are a test-harness trick rather than app behaviour, and only Chromium is
 * available to verify locally.
 */

const QUIET_ZONE_MODULES = 4;
const CANVAS_SIZE = 600;

async function installFakeCamera(page: Page, text: string) {
  const code = qrcode(0, 'M');
  code.addData(text);
  code.make();
  const size = code.getModuleCount();
  const dark = Array.from({ length: size }, (_, row) =>
    Array.from({ length: size }, (_, col) => code.isDark(row, col))
  );

  await page.addInitScript(
    ({ size, dark, quietZone, canvasSize }) => {
      const canvas = document.createElement('canvas');
      canvas.width = canvasSize;
      canvas.height = canvasSize;
      const ctx = canvas.getContext('2d') as CanvasRenderingContext2D;
      const cell = canvasSize / (size + quietZone * 2);
      const offset = quietZone * cell;

      const draw = () => {
        ctx.fillStyle = 'white';
        ctx.fillRect(0, 0, canvasSize, canvasSize);
        ctx.fillStyle = 'black';
        for (let row = 0; row < size; row++) {
          for (let col = 0; col < size; col++) {
            if (dark[row]?.[col]) {
              ctx.fillRect(offset + col * cell, offset + row * cell, cell + 1, cell + 1);
            }
          }
        }
        requestAnimationFrame(draw);
      };
      draw();

      const stream = (
        canvas as HTMLCanvasElement & { captureStream(frameRate?: number): MediaStream }
      ).captureStream(15);
      navigator.mediaDevices.getUserMedia = async () => stream;
    },
    { size, dark, quietZone: QUIET_ZONE_MODULES, canvasSize: CANVAS_SIZE }
  );
}

test.describe('QR scanning', () => {
  test.beforeEach(({ browserName }) => {
    test.skip(browserName !== 'chromium', 'canvas.captureStream fake camera is chromium-only here');
  });

  test('a joiner scanning the host offer reaches the same confirm screen pasting does', async ({
    page
  }) => {
    const offerCode = Buffer.from(
      JSON.stringify({ sdp: 'v=0 fixture', invitePlayerId: 'p2', invitePlayerName: 'Test Player' })
    ).toString('base64');

    await installFakeCamera(page, offerCode);
    await page.goto('/join');
    await page.getByRole('button', { name: /paste instead/i }).click();
    await page.getByRole('button', { name: 'Scan their code instead' }).click();

    await expect(page.getByText('Join as')).toContainText('Test Player', { timeout: 10_000 });
    // The dialog closes itself once it has decoded something usable.
    await expect(page.getByRole('dialog')).toHaveCount(0);
  });

  test('a host scanning a reply carries the decoded text into the same field pasting fills', async ({
    page
  }) => {
    const replyCode = Buffer.from(JSON.stringify({ sdp: 'v=0 fixture reply' })).toString('base64');

    await installFakeCamera(page, replyCode);
    await startGame(page, /commander/i, 2);
    await page.getByRole('button', { name: 'Connect a table' }).click();
    await page.getByRole('button', { name: 'Invite Player 2' }).click();
    await page.getByRole('button', { name: /paste instead/i }).click();
    await expect(page.locator('.sheet textarea.code[readonly]')).not.toHaveValue('', {
      timeout: 10_000
    });

    await page.getByRole('button', { name: 'Scan their reply instead' }).click();

    await expect(page.getByLabel('Paste their reply')).toHaveValue(replyCode, { timeout: 10_000 });
  });
});
