import { usePrinterSettingsStore } from '../store/printerSettingsStore';

/**
 * پرینتر پیش‌فرض برای پالس کشوی پول — کشو معمولاً به همان پرینتری وصل است که
 * رسید کامل (full) رویش چاپ می‌شود؛ اگر چنین پرینتری فعال نبود، اولین پرینتر
 * فعال را برمی‌گرداند.
 */
function resolveDefaultDrawerPrinterName(): string | undefined {
  const configs = usePrinterSettingsStore.getState().configs;
  const enabled = Object.values(configs).filter((c) => c.enabled);
  const withFullReceipt = enabled.find((c) => (c.receipts || []).some((r) => r.type === 'full' && r.enabled));
  return (withFullReceipt || enabled[0])?.name;
}

/**
 * پالس باز کردن کشوی پول — بی‌صدا، بدون دیالوگ (رجوع کنید به
 * electron/services/printer.ts::openCashDrawer). هم از دکمهٔ دستی «باز کردن
 * کشو» و هم به‌صورت خودکار بعد از تکمیل فروش نقدی فراخوانی می‌شود.
 */
export async function pulseCashDrawer(printerName?: string): Promise<{ success: boolean; error?: string }> {
  if (typeof window === 'undefined' || !window.electronAPI?.openCashDrawer) {
    return { success: false, error: 'ELECTRON_BRIDGE_UNAVAILABLE' };
  }
  const name = printerName || resolveDefaultDrawerPrinterName();
  if (!name) {
    return { success: false, error: 'DRAWER_NO_PRINTER_SELECTED' };
  }
  try {
    return await window.electronAPI.openCashDrawer(name);
  } catch (error: any) {
    return { success: false, error: String(error?.message || error) };
  }
}
