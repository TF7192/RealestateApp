import { Share } from '@capacitor/share';
import { Browser } from '@capacitor/browser';
import { App } from '@capacitor/app';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { isNative } from './platform';

/**
 * Generic share sheet — text/url. On native iOS this brings up the OS share
 * sheet (so the user can pick any app); on web it falls back to navigator.share
 * or clipboard.
 */
export async function shareSheet({ title, text, url }) {
  if (isNative()) {
    try {
      await Share.share({ title, text, url, dialogTitle: title });
      return true;
    } catch { return false; }
  }
  if (navigator.share) {
    try { await navigator.share({ title, text, url }); return true; } catch { return false; }
  }
  try {
    await navigator.clipboard.writeText(url || text || '');
    return 'copied';
  } catch { return false; }
}

export async function openUrl(url) {
  if (!url) return;
  if (isNative()) {
    try { await Browser.open({ url, presentationStyle: 'popover' }); return; } catch {}
  }
  window.open(url, '_blank', 'noopener,noreferrer');
}

export function openExternal(url) {
  if (!url) return;
  window.open(url, '_system');
}

// ────────────────────────────────────────────────────────────────
// openWhatsApp({ phone, text })
//
// On native iOS: uses the `whatsapp://send?phone=…&text=…` deep link via
// Capacitor's App.openUrl, which jumps straight to the WhatsApp app instead
// of opening a browser tab inside the WebView. Falls back to wa.me in the
// system browser when WhatsApp isn't installed.
//
// On web: opens wa.me in a new tab (today's behavior).
// ────────────────────────────────────────────────────────────────
export async function openWhatsApp({ phone, text } = {}) {
  const digits = (phone || '').replace(/[^\d]/g, '');
  const intl = digits.startsWith('0') ? '972' + digits.slice(1) : digits;
  const params = new URLSearchParams();
  if (intl) params.set('phone', intl);
  if (text) params.set('text', text);
  const deepLink = `whatsapp://send?${params.toString()}`;
  const webUrl = intl
    ? `https://wa.me/${intl}?text=${encodeURIComponent(text || '')}`
    : `https://wa.me/?text=${encodeURIComponent(text || '')}`;

  if (isNative()) {
    try {
      await App.openUrl({ url: deepLink });
      return true;
    } catch {
      try { await Browser.open({ url: webUrl }); return true; } catch { return false; }
    }
  }
  try {
    window.open(webUrl, '_blank', 'noopener,noreferrer');
    return true;
  } catch { return false; }
}

// ────────────────────────────────────────────────────────────────
// shareWithPhotos({ photos, text, title, url })
//
// Native-only: downloads up to MAX_PHOTOS images to the Capacitor Cache
// directory, then opens the iOS native share sheet with the file URIs +
// the marketing text. The user picks WhatsApp from the sheet — photos
// arrive as REAL attachments inside the chat (not as a wa.me link
// preview). Falls back to plain `shareSheet` (text/url only) on web or on
// any error.
// ────────────────────────────────────────────────────────────────
const MAX_PHOTOS = 5;

export async function shareWithPhotos({ photos = [], text, title, url } = {}) {
  if (!isNative()) {
    return shareSheet({ title, text, url });
  }
  const sources = (photos || []).slice(0, MAX_PHOTOS).filter(Boolean);
  if (sources.length === 0) {
    // No photos → just text-share via the OS sheet
    try {
      await Share.share({ title, text, url, dialogTitle: title });
      return true;
    } catch { return false; }
  }

  let fileUris = [];
  try {
    fileUris = await Promise.all(
      sources.map((src, idx) => downloadToCache(src, `estia-share-${Date.now()}-${idx}.jpg`))
    );
    fileUris = fileUris.filter(Boolean);
  } catch (e) {
    // Couldn't download — fall back to text-only share
    fileUris = [];
  }

  if (fileUris.length === 0) {
    return shareSheet({ title, text, url });
  }

  try {
    await Share.share({
      title,
      text: [text, url].filter(Boolean).join('\n\n'),
      files: fileUris,
      dialogTitle: title || 'שיתוף נכס',
    });
    return true;
  } catch (e) {
    // User cancelled, or files unsupported on this OS — last-ditch text share
    return shareSheet({ title, text, url });
  }
}

// Downloads a remote image, writes it to the Capacitor cache directory,
// returns the local file:// URI ready for Share.share.
async function downloadToCache(remoteUrl, filename) {
  if (!remoteUrl) return null;
  // Resolve relative paths (e.g. "/uploads/abc.jpg") against the current origin
  let absolute = remoteUrl;
  if (remoteUrl.startsWith('/')) absolute = window.location.origin + remoteUrl;
  const res = await fetch(absolute, { credentials: 'omit' });
  if (!res.ok) return null;
  const blob = await res.blob();
  const base64 = await blobToBase64(blob);
  const safeName = filename.replace(/[^a-zA-Z0-9._-]/g, '_');
  const written = await Filesystem.writeFile({
    path: `estia-share/${safeName}`,
    data: base64,
    directory: Directory.Cache,
    recursive: true,
  });
  return written.uri;
}

function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onloadend = () => {
      // result is "data:image/jpeg;base64,XXXX..." — Filesystem wants only the XXXX part
      const s = String(r.result || '');
      const idx = s.indexOf(',');
      resolve(idx >= 0 ? s.slice(idx + 1) : s);
    };
    r.onerror = reject;
    r.readAsDataURL(blob);
  });
}
