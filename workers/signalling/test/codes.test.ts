import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { generateRoomCode } from '../src/codes';

const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const fourBytes = fc.uint8Array({ minLength: 4, maxLength: 4 });

describe('generateRoomCode', () => {
  it('is four characters, every one from the room-code alphabet', () => {
    fc.assert(
      fc.property(fourBytes, (bytes) => {
        const code = generateRoomCode(() => bytes);
        expect(code).toHaveLength(4);
        expect([...code].every((char) => ALPHABET.includes(char))).toBe(true);
      })
    );
  });

  it('never contains a character that is easy to misread aloud at a table', () => {
    fc.assert(
      fc.property(fourBytes, (bytes) => {
        expect(generateRoomCode(() => bytes)).not.toMatch(/[0O1IL]/);
      })
    );
  });

  it('is a pure function of the bytes it is given', () => {
    fc.assert(
      fc.property(fourBytes, (bytes) => {
        expect(generateRoomCode(() => bytes)).toBe(generateRoomCode(() => bytes));
      })
    );
  });

  it('respects a requested length other than the default', () => {
    fc.assert(
      fc.property(fc.uint8Array({ minLength: 6, maxLength: 6 }), (bytes) => {
        expect(generateRoomCode(() => bytes, 6)).toHaveLength(6);
      })
    );
  });
});
