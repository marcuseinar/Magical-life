import { describe, expect, it } from 'vitest';
import { readJoinTarget } from './joinTarget';

describe('reading what a scan or a paste is pointing at', () => {
  /*
   * The host shows two different QR codes depending on which path is live: a
   * link to the short code on the default path, and the raw offer on the
   * no-server one. A joiner holding a camera up cannot tell them apart and
   * should not have to.
   */
  it('reads the short code out of a join link, which is what the default QR carries', () => {
    expect(readJoinTarget('https://example.com/join?code=XKCD')).toEqual({
      kind: 'short-code',
      code: 'XKCD'
    });
  });

  it('reads a link served from a subdirectory, as every preview build is', () => {
    expect(readJoinTarget('https://example.com/Magical-life/pr-36/join?code=abcd')).toEqual({
      kind: 'short-code',
      code: 'ABCD'
    });
  });

  it('upper-cases, because a code read aloud arrives in whatever case it was typed', () => {
    expect(readJoinTarget('xkcd')).toEqual({ kind: 'short-code', code: 'XKCD' });
  });

  it('takes a bare short code, for a host who sent the code rather than the link', () => {
    expect(readJoinTarget('  XKCD  ')).toEqual({ kind: 'short-code', code: 'XKCD' });
  });

  /* The offer blob: long, base64, and nothing like four letters. */
  it('treats anything long enough not to be a short code as an offer', () => {
    const offer = 'eyJzZHAiOiJ2PTAgZml4dHVyZSIsImludml0ZVBsYXllcklkIjoicDIifQ==';
    expect(readJoinTarget(offer)).toEqual({ kind: 'offer', code: offer });
  });

  it('treats a link with no code in it as an offer rather than guessing', () => {
    // Not a join link at all — let the offer decoder reject it and say so.
    expect(readJoinTarget('https://example.com/join')).toEqual({
      kind: 'offer',
      code: 'https://example.com/join'
    });
  });

  it('has nothing to point at when there is nothing there', () => {
    expect(readJoinTarget('   ')).toBeNull();
  });
});
