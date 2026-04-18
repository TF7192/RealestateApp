import { Geolocation } from '@capacitor/geolocation';
import { isNative } from './platform';

/**
 * getPosition — returns `{latitude, longitude, accuracy}` on success,
 * or null on failure. For richer error categorization use
 * `getPositionDetailed` which returns `{ ok, position?, reason? }`.
 */
export async function getPosition(opts = {}) {
  const r = await getPositionDetailed(opts);
  return r.ok ? r.position : null;
}

/**
 * Categorized geolocation request. Returns:
 *   { ok: true, position: {latitude, longitude, accuracy} }
 *   { ok: false, reason: 'denied'|'unavailable'|'timeout'|'unsupported'|'unknown', message }
 */
export async function getPositionDetailed({ timeoutMs = 10000 } = {}) {
  if (isNative()) {
    try {
      const perm = await Geolocation.checkPermissions();
      if (perm.location !== 'granted' && perm.coarseLocation !== 'granted') {
        const req = await Geolocation.requestPermissions();
        if (req.location !== 'granted' && req.coarseLocation !== 'granted') {
          return { ok: false, reason: 'denied', message: 'Location permission denied' };
        }
      }
      const pos = await Geolocation.getCurrentPosition({
        enableHighAccuracy: true,
        timeout: timeoutMs,
      });
      return {
        ok: true,
        position: {
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
        },
      };
    } catch (e) {
      const msg = String(e?.message || e);
      if (/permission/i.test(msg)) return { ok: false, reason: 'denied', message: msg };
      if (/timeout/i.test(msg))    return { ok: false, reason: 'timeout', message: msg };
      return { ok: false, reason: 'unknown', message: msg };
    }
  }
  if (!('geolocation' in navigator)) {
    return { ok: false, reason: 'unsupported', message: 'Browser has no geolocation API' };
  }
  // Web requires a secure context. On http:// (LAN dev) the browser silently denies.
  if (window.isSecureContext === false) {
    return { ok: false, reason: 'unsupported', message: 'Geolocation requires HTTPS' };
  }
  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({
        ok: true,
        position: {
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
        },
      }),
      (err) => {
        const code = err?.code;
        if (code === 1) return resolve({ ok: false, reason: 'denied',      message: err.message });
        if (code === 2) return resolve({ ok: false, reason: 'unavailable', message: err.message });
        if (code === 3) return resolve({ ok: false, reason: 'timeout',     message: err.message });
        resolve({ ok: false, reason: 'unknown', message: err?.message || 'unknown' });
      },
      { enableHighAccuracy: true, timeout: timeoutMs, maximumAge: 30000 }
    );
  });
}
