import { Preferences } from '@capacitor/preferences';
import { isNative } from './platform';

const mem = new Map();

export async function setItem(key, value) {
  const v = typeof value === 'string' ? value : JSON.stringify(value);
  if (isNative()) {
    await Preferences.set({ key, value: v });
  } else {
    try { localStorage.setItem(key, v); } catch { mem.set(key, v); }
  }
}

export async function getItem(key) {
  let v = null;
  if (isNative()) {
    const r = await Preferences.get({ key });
    v = r.value;
  } else {
    try { v = localStorage.getItem(key); } catch { v = mem.get(key) ?? null; }
  }
  if (v == null) return null;
  try { return JSON.parse(v); } catch { return v; }
}

export async function removeItem(key) {
  if (isNative()) {
    await Preferences.remove({ key });
  } else {
    try { localStorage.removeItem(key); } catch { mem.delete(key); }
  }
}

export const Keys = {
  AUTH_USER: 'estia.auth.user',
  RECENT_LOCATIONS: 'estia.recent.locations',
  SAVED_FILTERS: 'estia.saved.filters',
  LAST_VIEWED_PROPERTY: 'estia.lastViewed.property',
  HAPTICS_ENABLED: 'estia.haptics.enabled',
};
