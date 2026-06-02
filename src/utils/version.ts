/** مقایسه‌ی نسخه‌های نقطه‌ای ("2.3.0") — منفی اگر a<b، صفر اگر برابر، مثبت اگر a>b. */
function parseVersion(v: string): number[] {
  return String(v || '')
    .trim()
    .split('.')
    .map((part) => parseInt(part, 10))
    .map((n) => (Number.isFinite(n) ? n : 0));
}

export function compareVersions(a: string, b: string): number {
  const pa = parseVersion(a);
  const pb = parseVersion(b);
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i++) {
    const diff = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

/** true اگر نسخه‌ی فعلی قدیمی‌تر از حداقل لازم باشد. */
export function isVersionOutdated(current: string, minimum: string): boolean {
  if (!current) return true;
  if (!minimum) return false;
  return compareVersions(current, minimum) < 0;
}
