import { Share } from '@capacitor/share';
import { Browser } from '@capacitor/browser';
import { isNative } from './platform';

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
