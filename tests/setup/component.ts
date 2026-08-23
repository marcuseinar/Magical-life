import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/svelte';
import { afterEach } from 'vitest';

/* jsdom has no pointer capture and no PointerEvent; the panel's gestures need both. */
if (!('PointerEvent' in globalThis)) {
  (globalThis as { PointerEvent?: unknown }).PointerEvent = MouseEvent;
}
Element.prototype.setPointerCapture ??= () => {};
Element.prototype.releasePointerCapture ??= () => {};
Element.prototype.hasPointerCapture ??= () => true;

afterEach(cleanup);
