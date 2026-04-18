// Thin wrapper around @capacitor/haptics that is safe in the browser.
// When the app isn't running inside Capacitor (dev, plain web) all helpers
// no-op so we can sprinkle them everywhere without guards.

let impl = null;

async function loadCapacitor() {
  if (impl) return impl;
  if (typeof window === 'undefined') return null;
  try {
    const core = await import('@capacitor/core');
    if (!core.Capacitor?.isNativePlatform?.()) {
      impl = { enabled: false };
      return impl;
    }
    const { Haptics, ImpactStyle, NotificationType } = await import('@capacitor/haptics');
    impl = { enabled: true, Haptics, ImpactStyle, NotificationType };
  } catch {
    impl = { enabled: false };
  }
  return impl;
}

export async function tap() {
  const h = await loadCapacitor();
  if (!h?.enabled) return;
  try { await h.Haptics.impact({ style: h.ImpactStyle.Light }); } catch { /* ignore */ }
}

export async function press() {
  const h = await loadCapacitor();
  if (!h?.enabled) return;
  try { await h.Haptics.impact({ style: h.ImpactStyle.Medium }); } catch { /* ignore */ }
}

export async function success() {
  const h = await loadCapacitor();
  if (!h?.enabled) return;
  try { await h.Haptics.notification({ type: h.NotificationType.Success }); } catch { /* ignore */ }
}

export async function warning() {
  const h = await loadCapacitor();
  if (!h?.enabled) return;
  try { await h.Haptics.notification({ type: h.NotificationType.Warning }); } catch { /* ignore */ }
}

export async function error() {
  const h = await loadCapacitor();
  if (!h?.enabled) return;
  try { await h.Haptics.notification({ type: h.NotificationType.Error }); } catch { /* ignore */ }
}

export async function selection() {
  const h = await loadCapacitor();
  if (!h?.enabled) return;
  try { await h.Haptics.selectionStart(); await h.Haptics.selectionEnd(); } catch { /* ignore */ }
}

export default { tap, press, success, warning, error, selection };
