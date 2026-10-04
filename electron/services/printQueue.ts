import { BrowserWindow } from 'electron';
import type { PrinterInfo } from 'electron';
import { PrinterStatusCode, PrintErrorCode, PrintOperationError } from './printTypes';

export const mmToMicrons = (value: number) => Math.max(1, Math.round(value * 1000));

export type RawPrinter = {
  name?: string;
  displayName?: string;
  description?: string;
  status?: unknown;
  options?: Record<string, unknown>;
};

export const toRawPrinter = (printer: PrinterInfo): RawPrinter => ({
  name: printer.name,
  displayName: printer.displayName,
  description: printer.description,
  status: printer.status,
  options: printer.options as unknown as Record<string, unknown> | undefined,
});

export const printerQueueChains = new Map<string, Promise<void>>();
export const printerQueueSizes = new Map<string, number>();
export const PRINTER_QUEUE_MAX_PENDING = 20;

// Global print queue: serializes ALL print operations across all printers to prevent
// race conditions when multiple BrowserWindows access Electron's printing subsystem.
let globalPrintChain: Promise<void> = Promise.resolve();
export const globalPrintLock = async <T>(task: () => Promise<T>): Promise<T> => {
  const previous = globalPrintChain;
  const runTask = previous.catch(() => undefined).then(task);
  globalPrintChain = runTask.then(
    () => undefined,
    () => undefined,
  );
  return runTask;
};

// Prevents stuck print jobs from blocking the queue forever.
export const withTimeout = <T>(
  promise: Promise<T>,
  timeoutMs: number,
  errorMsg: string,
): Promise<T> =>
  Promise.race([
    promise,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error(errorMsg)), timeoutMs)),
  ]);

export const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export const toStatusText = (raw: RawPrinter): string => {
  const fields = [
    raw.status,
    raw.options?.['printer-state'],
    raw.options?.['printer-state-message'],
  ];
  return fields
    .filter((value) => value != null)
    .map((value) => String(value).toLowerCase())
    .join(' ');
};

export const inferPrinterStatusCode = (raw: RawPrinter): PrinterStatusCode => {
  const statusText = toStatusText(raw);
  if (
    statusText.includes('offline') ||
    statusText.includes('stopped') ||
    statusText.includes('unavailable')
  ) {
    return 'PRINTER_OFFLINE';
  }
  return 'PRINTER_READY';
};

export const mapFailureReasonToCode = (failureReason?: string): PrintErrorCode => {
  const text = String(failureReason || '').toLowerCase();
  if (text.includes('offline') || text.includes('unavailable')) {
    return 'PRINT_PRINTER_OFFLINE';
  }
  if (text.includes('dropped') || text.includes('cancel') || text.includes('aborted')) {
    return 'PRINT_JOB_DROPPED';
  }
  return 'PRINT_JOB_FAILED';
};

export const enqueuePrinterTask = async <T>(
  printerName: string,
  task: () => Promise<T>,
): Promise<T> => {
  const pending = printerQueueSizes.get(printerName) ?? 0;
  if (pending >= PRINTER_QUEUE_MAX_PENDING) {
    throw new PrintOperationError('PRINT_PRINTER_BUSY', []);
  }
  printerQueueSizes.set(printerName, pending + 1);
  const previous = printerQueueChains.get(printerName) ?? Promise.resolve();
  const runTask = previous.catch(() => undefined).then(task);
  const queueTail = runTask
    .then(
      () => undefined,
      () => undefined,
    )
    .finally(() => {
      if (printerQueueChains.get(printerName) === queueTail) {
        printerQueueChains.delete(printerName);
      }
      const current = printerQueueSizes.get(printerName) ?? 1;
      if (current <= 1) {
        printerQueueSizes.delete(printerName);
      } else {
        printerQueueSizes.set(printerName, current - 1);
      }
    });
  printerQueueChains.set(printerName, queueTail);
  return runTask;
};

export const createPrintWindow = () =>
  new BrowserWindow({
    show: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    },
  });
