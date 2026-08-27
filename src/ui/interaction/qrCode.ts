import qrcode from 'qrcode-generator';

/**
 * A grid of light/dark modules, framework-agnostic — `QrCode.svelte` draws
 * it as `<rect>`s, but nothing here knows that. Auto-picks the smallest QR
 * version that fits `text` (`typeNumber: 0`) at error-correction level `M`,
 * a reasonable middle ground between a smaller code and one that still scans
 * with a corner obscured by a thumb.
 */
export type QrMatrix = {
  readonly size: number;
  isDark(row: number, col: number): boolean;
};

export function encodeQr(text: string): QrMatrix {
  const code = qrcode(0, 'M');
  code.addData(text);
  code.make();
  const size = code.getModuleCount();
  return {
    size,
    isDark: (row, col) => code.isDark(row, col)
  };
}
