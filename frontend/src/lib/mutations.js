// X-4 — canonical mutation-then-refetch pattern for this codebase.
//
// Background: several UX bugs in the punch list shared a root cause —
// a mutation succeeded on the server, but the UI kept rendering stale
// local state because either (a) the optimistic update was wrong,
// (b) the success path forgot to refetch, or (c) the component held a
// second copy of the data that wasn't tied to the mutation.
//
// We don't use React Query. The convention instead is:
//
//   const submit = async () => {
//     try {
//       const res = await api.doThing(payload);
//       await reload();              // <- re-read authoritative state
//       toast.success('הפעולה הצליחה');
//       return res;
//     } catch (e) {
//       toast.error(e?.message || 'הפעולה נכשלה');
//       // Optimistic? Roll back here by restoring `prev`.
//       throw e;
//     }
//   };
//
// `runMutation` codifies that shape for call sites that want a
// one-liner. It's intentionally small — nothing clever, just the
// "happy path + rollback + toast" boilerplate in one place so
// components can stop copy-pasting it.
//
// Prefer component-local code when the mutation has non-trivial
// optimistic state to manage; reach for `runMutation` for simple
// "post then refresh" flows.

/**
 * @template T
 * @param {() => Promise<T>} mutate  The api call (no-arg async fn).
 * @param {object} [opts]
 * @param {() => Promise<void>|void} [opts.reload]   Refetch after success.
 * @param {(res: T) => void}          [opts.onSuccess]
 * @param {(err: Error) => void}      [opts.onError]
 * @param {{ success?: string; error?: string }} [opts.toasts]
 * @param {{ success?: Function; error?: Function }} [opts.toast] A toast
 *   handle from `useToast()`. Pass explicitly — the helper can't
 *   use the hook directly.
 * @returns {Promise<T>}
 */
export async function runMutation(mutate, opts = {}) {
  const { reload, onSuccess, onError, toasts, toast } = opts;
  try {
    const res = await mutate();
    // Reload AFTER the mutation returns — read-after-write ordering
    // guarantees the UI sees whatever the server produced (normalized
    // casing, computed fields, new ids).
    if (reload) await reload();
    onSuccess?.(res);
    if (toasts?.success) toast?.success?.(toasts.success);
    return res;
  } catch (err) {
    onError?.(err);
    if (toasts?.error !== undefined) {
      const msg = toasts.error || err?.message || 'הפעולה נכשלה';
      toast?.error?.(msg);
    }
    throw err;
  }
}

export default runMutation;
