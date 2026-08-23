import type { IdSource } from '$application/ports/idSource';

/** `randomUUID` needs a secure context; the fallback keeps local play working over plain http. */
export const randomIdSource: IdSource = {
  next: () =>
    globalThis.crypto?.randomUUID?.() ??
    `id-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
};
