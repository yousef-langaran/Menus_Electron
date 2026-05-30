const PERSIAN = 'fa-IR-u-ca-persian';

function parse(value: string | Date | null | undefined): Date | null {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(value);
  return isNaN(d.getTime()) ? null : d;
}

/** ۱۴۰۴ خرداد ۹ */
export function toShamsiDate(value: string | Date | null | undefined): string {
  const d = parse(value);
  if (!d) return '-';
  return new Intl.DateTimeFormat(PERSIAN, { year: 'numeric', month: 'long', day: 'numeric' }).format(d);
}

/** ۱۴۰۴ خرداد ۹،‏ ۱۴:۳۰ */
export function toShamsiDateTime(value: string | Date | null | undefined): string {
  const d = parse(value);
  if (!d) return '-';
  return new Intl.DateTimeFormat(PERSIAN, {
    year: 'numeric', month: 'long', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  }).format(d);
}

/** خرداد ۹ (بدون سال) */
export function toShamsiShort(value: string | Date | null | undefined): string {
  const d = parse(value);
  if (!d) return '-';
  return new Intl.DateTimeFormat(PERSIAN, { month: 'short', day: 'numeric' }).format(d);
}

/** ۱۴:۳۰ */
export function toShamsiTime(value: string | Date | null | undefined): string {
  const d = parse(value);
  if (!d) return '-';
  return new Intl.DateTimeFormat(PERSIAN, { hour: '2-digit', minute: '2-digit' }).format(d);
}
