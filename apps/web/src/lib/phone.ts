export function phoneDigits(value: string | null | undefined) {
  let digits = (value ?? '').replace(/\D/g, '');
  if (digits.startsWith('8')) digits = `7${digits.slice(1)}`;
  if (digits && !digits.startsWith('7')) digits = `7${digits}`;
  return digits.slice(0, 11);
}

export function maskPhone(value: string) {
  const digits = phoneDigits(value);
  const rest = digits.slice(1);
  if (!digits) return '';
  let out = '+7';
  if (!rest) return out;
  out += ` (${rest.slice(0, 3)}`;
  if (rest.length >= 3) out += ')';
  if (rest.length > 3) out += ` ${rest.slice(3, 6)}`;
  if (rest.length > 6) out += `-${rest.slice(6, 8)}`;
  if (rest.length > 8) out += `-${rest.slice(8, 10)}`;
  return out;
}

export function samePhone(left: string | null | undefined, right: string | null | undefined) {
  const a = phoneDigits(left);
  const b = phoneDigits(right);
  return a.length >= 10 && b.length >= 10 && a.slice(-10) === b.slice(-10);
}

export function splitName(value: string) {
  const parts = value.trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return { lastName: parts[0], firstName: parts[1], middleName: parts.slice(2).join(' ') };
  }
  return { lastName: '', firstName: parts[0] ?? '', middleName: '' };
}
