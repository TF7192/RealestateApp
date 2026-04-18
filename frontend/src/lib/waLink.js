// Build a wa.me URL cleanly. Accepts an Israeli phone in any format.

export function normalizeIsraeliPhone(raw) {
  if (!raw) return '';
  const digits = String(raw).replace(/[^\d]/g, '');
  if (!digits) return '';
  if (digits.startsWith('972')) return digits;
  if (digits.startsWith('0'))   return '972' + digits.slice(1);
  return digits;
}

export function waUrl(phone, text) {
  const p = normalizeIsraeliPhone(phone);
  const t = text ? `?text=${encodeURIComponent(text)}` : '';
  return `https://wa.me/${p}${t}`;
}

// Open without recipient — lets the user pick from their contacts inside WA
export function waUrlNoRecipient(text) {
  return `https://wa.me/?text=${encodeURIComponent(text || '')}`;
}

export function telUrl(phone) {
  return `tel:${(phone || '').replace(/[^\d+]/g, '')}`;
}

export function wazeUrl(streetCity) {
  return `https://waze.com/ul?q=${encodeURIComponent(streetCity || '')}&navigate=yes`;
}
