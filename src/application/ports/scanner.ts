/**
 * Reads a QR code through the device camera — the in-app half of the QR
 * handshake (`docs/adr/0004-p2p-transport-and-signalling.md`). The host's
 * own device has to feed a decoded answer back into the `RTCPeerConnection`
 * it already holds in memory, so unlike the offer (which can be *displayed*
 * as a QR and opened as a URL on the joiner's device) the reply cannot be
 * received by navigating anywhere — it has to be scanned, in the same page,
 * without losing that connection object.
 */
export type QrScanner = {
  /**
   * Opens the camera into `video` and starts decoding frames, calling
   * `onDecode` with each decoded string. May call it more than once for the
   * same code while the camera keeps seeing it — callers stop scanning (via
   * the returned function) once they have what they need. Rejects if the
   * camera cannot be opened at all (no permission, no device, insecure
   * context).
   *
   * Returns a function that stops the camera and the decode loop — always
   * call it once the code has been read or the caller gives up, so the
   * camera light actually goes off.
   */
  start(video: HTMLVideoElement, onDecode: (text: string) => void): Promise<() => void>;
};
