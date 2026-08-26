import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { decodeCode, encodeCode, isOfferPayload } from './connectionCode';

describe('connection code', () => {
  it('round-trips an offer payload', () => {
    const payload = {
      sdp: 'v=0\r\no=- 1 1 IN IP4 0.0.0.0',
      invitePlayerId: 'p2',
      invitePlayerName: 'Anna'
    };
    const decoded = decodeCode(encodeCode(payload));
    expect(decoded).toEqual({ ok: true, value: payload });
  });

  it('round-trips an answer payload', () => {
    const payload = { sdp: 'v=0\r\no=- 2 1 IN IP4 0.0.0.0' };
    const decoded = decodeCode(encodeCode(payload));
    expect(decoded).toEqual({ ok: true, value: payload });
  });

  it('survives arbitrary SDP-shaped text round-tripping', () => {
    fc.assert(
      fc.property(
        fc.string(),
        fc.string({ minLength: 1 }),
        fc.string({ minLength: 1 }),
        (sdp, invitePlayerId, invitePlayerName) => {
          const payload = { sdp, invitePlayerId, invitePlayerName };
          expect(decodeCode(encodeCode(payload))).toEqual({ ok: true, value: payload });
        }
      )
    );
  });

  it('tolerates the whitespace a paste from a messaging app adds', () => {
    const payload = { sdp: 'v=0' };
    const decoded = decodeCode(`  ${encodeCode(payload)}\n`);
    expect(decoded).toEqual({ ok: true, value: payload });
  });

  it('reports a mistyped or truncated code rather than throwing', () => {
    expect(decodeCode('not base64 at all')).toEqual({ ok: false });
    expect(decodeCode(encodeCode({ sdp: 'v=0' }).slice(0, -4))).toEqual({ ok: false });
    expect(decodeCode('')).toEqual({ ok: false });
  });

  it('rejects a decoded value with no sdp field', () => {
    expect(decodeCode(btoa(JSON.stringify({ notAnSdp: true })))).toEqual({ ok: false });
    expect(decodeCode(btoa(JSON.stringify('just a string')))).toEqual({ ok: false });
    expect(decodeCode(btoa(JSON.stringify(null)))).toEqual({ ok: false });
  });

  it('tells an offer from an answer by the invite field', () => {
    expect(isOfferPayload({ sdp: 'v=0', invitePlayerId: 'p2', invitePlayerName: 'Anna' })).toBe(
      true
    );
    expect(isOfferPayload({ sdp: 'v=0' })).toBe(false);
  });
});
