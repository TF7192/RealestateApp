import { Haptics, ImpactStyle, NotificationType } from '@capacitor/haptics';
import { isNative } from './platform';

const safe = async (fn) => {
  if (!isNative()) return;
  try { await fn(); } catch {}
};

export const tap = () => safe(() => Haptics.impact({ style: ImpactStyle.Light }));
export const press = () => safe(() => Haptics.impact({ style: ImpactStyle.Medium }));
export const thud = () => safe(() => Haptics.impact({ style: ImpactStyle.Heavy }));
export const select = () => safe(() => Haptics.selectionChanged());
export const success = () => safe(() => Haptics.notification({ type: NotificationType.Success }));
export const warn = () => safe(() => Haptics.notification({ type: NotificationType.Warning }));
export const err = () => safe(() => Haptics.notification({ type: NotificationType.Error }));
