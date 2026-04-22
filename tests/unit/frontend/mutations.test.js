import { describe, it, expect, vi } from 'vitest';
import { runMutation } from '../../../frontend/src/lib/mutations.js';

// X-4 — canonical mutation/refetch shape.
//
// The helper is intentionally tiny. These tests just pin the invariants
// so future drive-bys don't accidentally turn success paths into "fire
// and forget" (which is how several punch-list UX bugs happened in the
// first place).

describe('X-4 — runMutation', () => {
  it('awaits `reload` AFTER the mutation resolves so UI reads fresh state', async () => {
    const order = [];
    const mutate = vi.fn().mockImplementation(async () => { order.push('mutate'); return { id: 1 }; });
    const reload = vi.fn().mockImplementation(async () => { order.push('reload'); });
    await runMutation(mutate, { reload });
    expect(order).toEqual(['mutate', 'reload']);
  });

  it('fires a success toast ONLY when `toasts.success` is set', async () => {
    const toast = { success: vi.fn(), error: vi.fn() };
    await runMutation(async () => 'ok', { toast, toasts: { success: 'הצלחה' } });
    expect(toast.success).toHaveBeenCalledWith('הצלחה');
  });

  it('does NOT reload or toast-success when the mutation throws', async () => {
    const reload = vi.fn();
    const toast = { success: vi.fn(), error: vi.fn() };
    const onError = vi.fn();
    await expect(
      runMutation(async () => { throw new Error('boom'); }, {
        reload, toast, toasts: { success: 'x', error: '' }, onError,
      }),
    ).rejects.toThrow('boom');
    expect(reload).not.toHaveBeenCalled();
    expect(toast.success).not.toHaveBeenCalled();
    expect(onError).toHaveBeenCalledOnce();
  });

  it('re-throws so the caller can roll back optimistic state', async () => {
    const err = new Error('nope');
    await expect(
      runMutation(async () => { throw err; }),
    ).rejects.toBe(err);
  });
});
