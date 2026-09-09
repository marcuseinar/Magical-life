import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import QrScanSheet from './QrScanSheet.svelte';
import type { QrScanner } from '$application/ports/scanner';

function fakeScanner(start: QrScanner['start']): QrScanner {
  return { start };
}

describe('QrScanSheet', () => {
  it('starts the camera once the preview mounts', async () => {
    const start: QrScanner['start'] = vi.fn(async () => () => {});
    render(QrScanSheet, {
      props: { scanner: fakeScanner(start), onscan: vi.fn(), onclose: vi.fn() }
    });

    await waitFor(() => expect(start).toHaveBeenCalledTimes(1));
    expect(vi.mocked(start).mock.calls[0]?.[0]).toBeInstanceOf(HTMLVideoElement);
  });

  it('hands back whatever the scanner decodes', async () => {
    let decode: (text: string) => void = () => {};
    const start = vi.fn(async (_video: HTMLVideoElement, onDecode: (text: string) => void) => {
      decode = onDecode;
      return () => {};
    });
    const onscan = vi.fn();
    render(QrScanSheet, { props: { scanner: fakeScanner(start), onscan, onclose: vi.fn() } });

    await waitFor(() => expect(start).toHaveBeenCalled());
    decode('the-decoded-text');

    expect(onscan).toHaveBeenCalledWith('the-decoded-text');
  });

  it('shows a camera-trouble message, not a stuck preview, when the camera refuses to open', async () => {
    const start = vi.fn(async () => {
      throw new Error('Permission denied');
    });
    render(QrScanSheet, {
      props: { scanner: fakeScanner(start), onscan: vi.fn(), onclose: vi.fn() }
    });

    expect(await screen.findByRole('alert')).toHaveTextContent(/camera/i);
  });

  it('stops the camera when Cancel is pressed', async () => {
    const stop = vi.fn();
    const start = vi.fn(async () => stop);
    const onclose = vi.fn();
    render(QrScanSheet, { props: { scanner: fakeScanner(start), onscan: vi.fn(), onclose } });

    await waitFor(() => expect(start).toHaveBeenCalled());
    await fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(stop).toHaveBeenCalled();
    expect(onclose).toHaveBeenCalled();
  });

  it('stops the camera on Escape', async () => {
    const stop = vi.fn();
    const start = vi.fn(async () => stop);
    const onclose = vi.fn();
    render(QrScanSheet, { props: { scanner: fakeScanner(start), onscan: vi.fn(), onclose } });

    await waitFor(() => expect(start).toHaveBeenCalled());
    await fireEvent.keyDown(window, { key: 'Escape' });

    expect(stop).toHaveBeenCalled();
    expect(onclose).toHaveBeenCalled();
  });

  it('stops the camera when the sheet unmounts for any other reason', async () => {
    const stop = vi.fn();
    const start = vi.fn(async () => stop);
    const { unmount } = render(QrScanSheet, {
      props: { scanner: fakeScanner(start), onscan: vi.fn(), onclose: vi.fn() }
    });

    await waitFor(() => expect(start).toHaveBeenCalled());
    unmount();

    expect(stop).toHaveBeenCalled();
  });
});
