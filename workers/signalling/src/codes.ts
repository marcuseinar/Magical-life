/** No `0`/`O`, `1`/`I`/`L` — the code gets read aloud across a table as often
 *  as it gets typed. 32 characters divides 256 evenly, so a uniform random
 *  byte modulo the alphabet length carries no bias. */
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

export function generateRoomCode(randomBytes: (n: number) => Uint8Array, length = 4): string {
  const bytes = randomBytes(length);
  let code = '';
  for (const byte of bytes) {
    code += ALPHABET[byte % ALPHABET.length];
  }
  return code;
}
