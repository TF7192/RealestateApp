import { StatusBar, Style } from '@capacitor/status-bar';
import { isNative, isIOS } from './platform';

export async function initStatusBar() {
  if (!isNative()) return;
  try {
    await StatusBar.setStyle({ style: Style.Dark });
    if (!isIOS()) {
      await StatusBar.setBackgroundColor({ color: '#0d0f14' });
    }
    await StatusBar.setOverlaysWebView({ overlay: false });
  } catch { /* ignore */ }
}

export async function setStatusBarDark() {
  if (!isNative()) return;
  try { await StatusBar.setStyle({ style: Style.Dark }); } catch { /* ignore */ }
}
