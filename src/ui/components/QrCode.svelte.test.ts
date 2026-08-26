import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import QrCode from './QrCode.svelte';

describe('QrCode', () => {
  it('renders as an accessible image', () => {
    render(QrCode, { props: { value: 'https://example.com/join?code=XKCD' } });
    expect(screen.getByRole('img', { name: 'QR code to join the table' })).toBeInTheDocument();
  });

  it('draws at least one dark module for real content', () => {
    render(QrCode, { props: { value: 'https://example.com/join?code=XKCD' } });
    const svg = screen.getByRole('img', { name: 'QR code to join the table' });
    expect(svg.querySelectorAll('rect[fill="black"]').length).toBeGreaterThan(0);
  });

  it('sizes the svg to the requested size', () => {
    render(QrCode, { props: { value: 'https://example.com/join?code=XKCD', size: 200 } });
    const svg = screen.getByRole('img', { name: 'QR code to join the table' });
    expect(svg.getAttribute('width')).toBe('200');
    expect(svg.getAttribute('height')).toBe('200');
  });
});
