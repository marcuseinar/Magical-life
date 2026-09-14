import jsQR from 'jsqr';
import type { QrScanner } from '$application/ports/scanner';

/**
 * `QrScanner` over `getUserMedia` and `jsQR`. Proven through
 * `tests/e2e/qr-scan.spec.ts` against a real (faked-at-the-camera-driver
 * level) `MediaStream`, the same way `webRtcTransport.ts` is proven — jsdom
 * implements neither a camera nor `<video>` playback, so there is nothing a
 * unit test here could exercise honestly.
 *
 * `jsQR` decodes raw pixels rather than relying on `BarcodeDetector`, which
 * Safari does not implement at all: one code path that actually works on
 * every device this app targets beats a faster path that only works on
 * some of them.
 */
export function createCameraQrScanner(): QrScanner {
  return {
    async start(video, onDecode) {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' }
      });

      video.srcObject = stream;
      await video.play();

      const canvas = document.createElement('canvas');
      const context = canvas.getContext('2d', { willReadFrequently: true });

      let stopped = false;
      let frame: number;

      const tick = () => {
        if (stopped) return;
        if (context !== null && video.readyState >= video.HAVE_CURRENT_DATA) {
          canvas.width = video.videoWidth;
          canvas.height = video.videoHeight;
          context.drawImage(video, 0, 0, canvas.width, canvas.height);
          const frameData = context.getImageData(0, 0, canvas.width, canvas.height);
          const result = jsQR(frameData.data, frameData.width, frameData.height);
          if (result !== null) onDecode(result.data);
        }
        frame = requestAnimationFrame(tick);
      };
      frame = requestAnimationFrame(tick);

      return () => {
        stopped = true;
        cancelAnimationFrame(frame);
        for (const track of stream.getTracks()) track.stop();
      };
    }
  };
}
