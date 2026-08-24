import { usePrinterSettingsStore } from '../store/printerSettingsStore';
import { buildPrinterJobs, loadPrintTemplateSources } from '../utils/printTemplates';

function normalizeOrderForAutoPrint(order: Record<string, unknown>): Record<string, unknown> {
  const payload = { ...order };
  if (!payload.orderNumber && payload.id != null) {
    payload.orderNumber = `ORD-${payload.id}`;
  }
  if (!payload.restaurantName) {
    const restaurant = payload.restaurant as { name?: string; name_fa?: string } | undefined;
    payload.restaurantName = restaurant?.name_fa || restaurant?.name || '';
  }
  return payload;
}

/**
 * چاپ خودکار رسید/فیش آشپزخانه به‌محض رسیدن هر سفارش آنلاین جدید از سوکت.
 * فقط وقتی «چاپ خودکار» در تنظیمات فعال باشد اجرا می‌شود؛ رسیدها و پرینترهای
 * مقصد همان‌هایی هستند که کاربر در صفحهٔ تنظیمات پرینتر فعال کرده است.
 */
export async function autoPrintNewOrder(order: Record<string, unknown> | null | undefined): Promise<void> {
  if (!order || typeof window === 'undefined' || !window.electronAPI?.printReceipt) {
    return;
  }

  await usePrinterSettingsStore.getState().loadFromStorage();
  const { configs, getPrinterReceipts, autoPrintOnNewOrder } = usePrinterSettingsStore.getState();
  if (!autoPrintOnNewOrder) {
    return;
  }

  const enabledPrinters = Object.values(configs).filter((c) => c.enabled);
  if (enabledPrinters.length === 0) {
    return;
  }

  try {
    const { templatesMap, defaultTemplate } = await loadPrintTemplateSources();
    const printerJobs = buildPrinterJobs(enabledPrinters, getPrinterReceipts, templatesMap, defaultTemplate);
    if (printerJobs.length === 0) {
      return;
    }

    const orderKeys = [order.id != null ? String(order.id) : '', order.orderNumber as string].filter(Boolean);
    const res = await window.electronAPI.printReceipt(normalizeOrderForAutoPrint(order), printerJobs, orderKeys);
    if (res?.status !== 'PRINT_OK') {
      console.warn('[autoPrintNewOrder] print did not complete successfully', res);
    }
  } catch (error) {
    console.error('[autoPrintNewOrder] failed to auto-print new order', error);
  }
}
