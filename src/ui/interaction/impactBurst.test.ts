import { describe, expect, it } from 'vitest';
import { MAX_GLYPHS, MIN_GLYPHS, impactSpec } from './impactBurst';

describe('impact spec', () => {
  it('reads a loss from a negative delta', () => {
    expect(impactSpec(-1).direction).toBe('loss');
  });

  it('reads a gain from a positive delta', () => {
    expect(impactSpec(1).direction).toBe('gain');
  });

  it('gives even a single point a real cloud, not a lone glyph', () => {
    const spec = impactSpec(-1);
    expect(spec.glyphs).toBe(MIN_GLYPHS);
    expect(spec.glyphs).toBeGreaterThan(10);
    expect(spec.scale).toBe(1);
  });

  it('grows the cloud with the size of the change', () => {
    expect(impactSpec(-2).glyphs).toBeGreaterThan(impactSpec(-1).glyphs);
    expect(impactSpec(-4).glyphs).toBeGreaterThan(impactSpec(-2).glyphs);
  });

  it('grows the scale with the size of the change', () => {
    expect(impactSpec(-4).scale).toBeGreaterThan(impactSpec(-1).scale);
  });

  it('caps the cloud so a huge slide never overwhelms the screen', () => {
    expect(impactSpec(-50).glyphs).toBe(MAX_GLYPHS);
    expect(impactSpec(50).glyphs).toBe(MAX_GLYPHS);
  });

  it('caps the scale so a huge slide stays legible', () => {
    const near = impactSpec(-50).scale;
    const far = impactSpec(-500).scale;
    expect(near).toBe(far);
  });

  it('scales the same amount whichever direction it moves', () => {
    expect(impactSpec(-6)).toEqual({ ...impactSpec(6), direction: 'loss' });
  });
});
