import type { Socket } from 'socket.io-client';
import { usePrinterSettingsStore } from '../store/printerSettingsStore';

/**
 * اعلام پرینترهای پنل به سرور (وب‌ادمین لیست می‌گیرد) و اجرای چاپ از راه دور از وب.
 */
export function attachOrdersSocketPanelSidecar(socket: Socket | null): () => void {
  if (!socket || typeof window === 'undefined' || !window.electronAPI?.getPrinters) {
    return () => undefined;
  }

  const announce = async () => {
    try {
      await usePrinterSettingsStore.getState().loadFromStorage();
      const list = await window.electronAPI.getPrinters();
      const { configs, getPrinterReceipts } = usePrinterSettingsStore.getState();
      const printers = (list || []).map((p) => {
        const cfg = configs[p.name];
        return {
          name: p.name,
          displayName: p.displayName || cfg?.displayName,
          enabled: cfg?.enabled ?? false,
          receipts: cfg ? getPrinterReceipts(p.name) : [],
        };
      });
      const label =
        typeof navigator !== 'undefined' ? `electron-${navigator.platform}` : 'electron';
      socket.emit('panels:register', { label, printers });
    } catch (e) {
      console.warn('[ordersSocketPanelSidecar] panels:register failed', e);
    }
  };

  const onRemotePrint = async (payload: {
    requestId?: string;
    orderData?: unknown;
    selectedPrinterNames?: string[];
  }) => {
    const requestId = payload?.requestId;
    try {
      await runRemotePrintJob(payload);
      socket.emit('orders:remote-print-ack', { requestId, ok: true });
    } catch (e) {
      socket.emit('orders:remote-print-ack', {
        requestId,
        ok: false,
        error: e instanceof Error ? e.message : 'print-failed',
      });
    }
  };

  const onReady = () => void announce();
  const onConnect = () => void announce();

  socket.on('orders:ready', onReady);
  socket.on('connect', onConnect);
  socket.on('orders:remote-print-job', onRemotePrint);
  const interval = setInterval(() => void announce(), 60000);

  return () => {
    socket.off('orders:ready', onReady);
    socket.off('connect', onConnect);
    socket.off('orders:remote-print-job', onRemotePrint);
    clearInterval(interval);
  };
}

async function runRemotePrintJob(payload: {
  orderData?: unknown;
  selectedPrinterNames?: string[];
}) {
  const orderData = payload?.orderData as Record<string, unknown> | undefined;
  if (!orderData || !window.electronAPI?.printReceipt) {
    throw new Error('invalid-print-payload');
  }

  const selectedPrinterNames = Array.isArray(payload.selectedPrinterNames)
    ? payload.selectedPrinterNames.filter((n) => typeof n === 'string' && n.trim())
    : [];

  const { getPrinterReceipts, configs } = usePrinterSettingsStore.getState();
  const enabledPrinters = Object.values(configs).filter((c) => c.enabled);

  const printersToUse =
    selectedPrinterNames.length > 0
      ? enabledPrinters.filter((p) => selectedPrinterNames.includes(p.name))
      : enabledPrinters;

  const [templatesMap, defaultTemplate] = await Promise.all([
    window.electronAPI.getPrintTemplatesMap?.() ?? Promise.resolve({}),
    window.electronAPI.getDefaultPrintTemplate?.() ?? Promise.resolve(null),
  ]);

  const printerJobs = printersToUse.flatMap((printer) => {
    const template = templatesMap?.[printer.name] ?? defaultTemplate ?? null;
    return getPrinterReceipts(printer.name)
      .filter((r) => r.enabled)
      .map((receipt) => ({
        name: printer.name,
        displayName: printer.displayName,
        paperWidth: template?.paperWidth ?? printer.paperWidth,
        paperLength: template?.paperLength ?? printer.paperLength,
        margin: template?.margin ?? printer.margin,
        receiptType: receipt.type,
        copies: receipt.copies,
        layout: template?.layout ?? undefined,
      }));
  });

  if (printerJobs.length === 0) {
    throw new Error('PRINT_NO_PRINTER_SELECTED');
  }

  const orderKeys = [String(orderData.id), orderData.orderNumber as string].filter(Boolean);
  const res = await window.electronAPI.printReceipt(orderData, printerJobs, orderKeys);
  if (res?.status !== 'PRINT_OK') {
    throw new Error((res as { code?: string })?.code || 'PRINT_UNKNOWN_ERROR');
  }
}
