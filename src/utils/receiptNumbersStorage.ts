const STORAGE_KEY = 'menus-receipt-numbers-map';
const NEXT_NUMBER_KEY = 'menus-receipt-next-number';

/** در حالت مرورگر (بدون Electron) شماره بعدی را از localStorage می‌گیرد و یکی جلو می‌اندازد */
export function getNextReceiptNumberBrowser(): number {
  try {
    const raw = localStorage.getItem(NEXT_NUMBER_KEY);
    const next = raw ? Math.max(1, parseInt(raw, 10) || 1) : 1;
    localStorage.setItem(NEXT_NUMBER_KEY, String(next + 1));
    return next;
  } catch {
    return 1;
  }
}

export function getReceiptNumbersMapFromStorage(): Record<string, number> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const data = JSON.parse(raw);
    if (data && typeof data === 'object') {
      const out: Record<string, number> = {};
      for (const [k, v] of Object.entries(data)) {
        if (typeof k === 'string' && typeof v === 'number' && v >= 1) out[k] = v;
      }
      return out;
    }
  } catch {
    // ignore
  }
  return {};
}

export function saveReceiptNumbersToStorage(orderKeys: string[], receiptNumber: number): void {
  if (!orderKeys?.length || receiptNumber < 1) return;
  const current = getReceiptNumbersMapFromStorage();
  for (const key of orderKeys) {
    if (key) current[key] = receiptNumber;
  }
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(current));
  } catch {
    // ignore
  }
}
