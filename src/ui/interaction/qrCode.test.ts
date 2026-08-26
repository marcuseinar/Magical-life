import { describe, expect, it } from 'vitest';
import { encodeQr } from './qrCode';

describe('encodeQr', () => {
  it('produces a square matrix', () => {
    const matrix = encodeQr('https://example.com/join?code=XKCD');
    expect(matrix.size).toBeGreaterThan(0);
    for (let row = 0; row < matrix.size; row++) {
      for (let col = 0; col < matrix.size; col++) {
        expect(typeof matrix.isDark(row, col)).toBe('boolean');
      }
    }
  });

  it('grows to fit more data', () => {
    const short = encodeQr('a');
    const long = encodeQr('a'.repeat(500));
    expect(long.size).toBeGreaterThan(short.size);
  });

  it('is deterministic for the same input', () => {
    const a = encodeQr('https://example.com/join?code=XKCD');
    const b = encodeQr('https://example.com/join?code=XKCD');
    expect(a.size).toBe(b.size);
    for (let row = 0; row < a.size; row++) {
      for (let col = 0; col < a.size; col++) {
        expect(a.isDark(row, col)).toBe(b.isDark(row, col));
      }
    }
  });

  it('differs for different input', () => {
    const a = encodeQr('https://example.com/join?code=AAAA');
    const b = encodeQr('https://example.com/join?code=ZZZZ');
    const matricesDiffer =
      a.size !== b.size ||
      Array.from({ length: a.size }).some((_, row) =>
        Array.from({ length: a.size }).some((_, col) => a.isDark(row, col) !== b.isDark(row, col))
      );
    expect(matricesDiffer).toBe(true);
  });
});
