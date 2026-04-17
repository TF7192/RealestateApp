// Deep-link builders used across the app.
// All sanitize the phone to digits only so tel:/sms:/whatsapp links work on both iOS + Android.

export function sanitizePhone(raw) {
  if (!raw) return '';
  const digits = String(raw).replace(/\D/g, '');
  if (!digits) return '';
  if (digits.startsWith('0')) return '972' + digits.slice(1);
  return digits;
}

export function telUrl(phone) {
  const d = sanitizePhone(phone);
  return d ? `tel:+${d}` : '';
}

export function smsUrl(phone, body = '') {
  const d = sanitizePhone(phone);
  if (!d) return '';
  const q = body ? `?body=${encodeURIComponent(body)}` : '';
  return `sms:+${d}${q}`;
}

export function whatsappUrl(phone, text = '') {
  const d = sanitizePhone(phone);
  const base = d ? `https://wa.me/${d}` : 'https://wa.me/';
  const q = text ? `?text=${encodeURIComponent(text)}` : '';
  return `${base}${q}`;
}

export function wazeUrl({ lat, lng, address }) {
  if (lat && lng) return `https://waze.com/ul?ll=${lat},${lng}&navigate=yes`;
  if (address) return `https://waze.com/ul?q=${encodeURIComponent(address)}&navigate=yes`;
  return '';
}

export function mapsUrl({ lat, lng, address }) {
  if (lat && lng) return `https://maps.google.com/?q=${lat},${lng}`;
  if (address) return `https://maps.google.com/?q=${encodeURIComponent(address)}`;
  return '';
}

export function appBaseUrl() {
  if (typeof window === 'undefined') return '';
  const { protocol, host } = window.location;
  if (protocol === 'capacitor:' || protocol === 'http:' && host.includes('localhost')) {
    return 'https://estia.tripzio.xyz';
  }
  return `${protocol}//${host}`;
}

export function publicPropertyUrl(id) {
  return `${appBaseUrl()}/p/${id}`;
}
