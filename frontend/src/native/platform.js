import { Capacitor } from '@capacitor/core';

export const isNative = () => Capacitor.isNativePlatform();
export const isIOS = () => Capacitor.getPlatform() === 'ios';
export const isAndroid = () => Capacitor.getPlatform() === 'android';
export const isWeb = () => Capacitor.getPlatform() === 'web';

export function shouldUseMobileUI() {
  if (isNative()) return true;
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(max-width: 820px)').matches;
}
