import type { Component } from 'svelte';
import type { QrScanSheetProps } from '$ui/components/QrScanSheet.svelte';
import type { QrScanner } from '$application/ports/scanner';

/**
 * `jsQR` alone is heavier than this app's entire solo-route bundle budget
 * (docs/architecture.md), and `GameScreen` — which every solo player loads —
 * already reaches `TableSheet.svelte` directly. Loading the scanner and its
 * sheet only when a player actually taps "Scan" keeps that cost off everyone
 * who never does, the same way route-level splitting keeps mode 2's code off
 * mode 1 already.
 */
let loaded: Promise<{ QrScanSheet: Component<QrScanSheetProps>; scanner: QrScanner }> | null = null;

export function loadQrScanSheet() {
  loaded ??= Promise.all([
    import('$ui/components/QrScanSheet.svelte'),
    import('$adapters/platform/cameraQrScanner')
  ]).then(([sheetModule, scannerModule]) => ({
    QrScanSheet: sheetModule.default,
    scanner: scannerModule.createCameraQrScanner()
  }));
  return loaded;
}
