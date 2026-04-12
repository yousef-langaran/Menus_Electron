/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_BASE_URL?: string;
  readonly VITE_API_BASE_VERSION?: string;
  readonly NEXT_PUBLIC_API_BASE_URL?: string;
  readonly NEXT_PUBLIC_API_BASE_VERSION?: string;
  readonly API_BASE_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

type ElectronPrinterJob = {
  name: string;
  displayName?: string;
  paperWidth?: number;
  paperLength?: number;
  margin?: number;
  receiptType?: 'full' | 'kitchen';
  copies?: number;
  /** قالب طراح (نسخه ۲) برای چاپ بر اساس layout */
  layout?: { version: 2; rows: any[] };
};

type ElectronPrintErrorCode =
  | 'PRINT_NO_PRINTER_SELECTED'
  | 'PRINT_PRINTER_DISCOVERY_FAILED'
  | 'PRINT_PRINTER_NOT_FOUND'
  | 'PRINT_PRINTER_OFFLINE'
  | 'PRINT_JOB_DROPPED'
  | 'PRINT_JOB_FAILED'
  | 'PRINT_UNKNOWN_ERROR';

type ElectronPrintReceiptType = 'full' | 'kitchen';

type ElectronPrintFailureDetail = {
  printerName: string;
  receiptType: ElectronPrintReceiptType;
  code: ElectronPrintErrorCode;
};

type ElectronPrintResult =
  | { status: 'PRINT_OK'; receiptNumber: number }
  | { status: 'PRINT_ERROR'; code: ElectronPrintErrorCode; details: ElectronPrintFailureDetail[]; receiptNumber: 0 };

type ElectronPrinterStatusCode = 'PRINTER_READY' | 'PRINTER_OFFLINE';

declare global {
  interface Window {
    electronAPI?: {
      checkOnline: () => Promise<boolean>;
      syncOrders: (token?: string) => Promise<any>;
      printReceipt: (orderData: any, printerJobs: ElectronPrinterJob[], orderKeys?: string | string[]) => Promise<ElectronPrintResult>;
      getReceiptNumbersMap: () => Promise<Record<string, number>>;
      assignReceiptNumberForOrder: (orderKeys: string[]) => Promise<number>;
      getPrinters: () => Promise<Array<{ name: string; displayName: string; description: string; statusCode: ElectronPrinterStatusCode }>>;
      showMessageBox: (options: any) => Promise<any>;
      saveOfflineOrder: (
        orderData: any,
        token: string,
        baseURL?: string
      ) => Promise<{ success: boolean; orderId?: number; error?: string }>;
      getOfflineOrders: () => Promise<any[]>;
      generateReceiptPreview: (
        orderData: any,
        options?: { paperWidth?: number; margin?: number; contentWidthMm?: number; receiptType?: 'full' | 'kitchen'; layout?: any }
      ) => Promise<{ success: boolean; html?: string; imageDataUrl?: string; error?: string }>;
      loadUserSession: () => Promise<{ user: any; token: string; cachedAt: string } | null>;
      saveUserSession: (data: { user: any; token: string }) => Promise<{ success: boolean; error?: string }>;
      clearUserSession: () => Promise<{ success: boolean; error?: string }>;
      loadPrinterConfigs: () => Promise<Record<string, any>>;
      savePrinterConfigs: (configs: Record<string, any>) => Promise<{ success: boolean; error?: string }>;
      getDefaultPrintTemplate: () => Promise<{ id: number; name: string; receiptType: string; paperWidth: number; paperLength: number; margin: number; layout?: any } | null>;
      setDefaultPrintTemplate: (template: any) => Promise<{ success: boolean; error?: string }>;
      getPrintTemplatesMap: () => Promise<Record<string, { id: number; name: string; paperWidth: number; paperLength: number; margin: number; layout?: any } | null>>;
      setPrintTemplateForPrinter: (printerName: string, template: any) => Promise<{ success: boolean; error?: string }>;
      getReceiptNumberSettings: () => Promise<{ nextNumber: number; resetPolicy: string; startNumber: number; lastResetDate: string; dailyResetTime: string }>;
      saveReceiptNumberSettings: (settings: any) => Promise<{ success: boolean; error?: string }>;
      getReceiptPriceDisplayUnit: () => Promise<'toman' | 'rial'>;
      saveReceiptPriceDisplayUnit: (unit: 'toman' | 'rial') => Promise<{ success: boolean; error?: string }>;
      cacheImage: (imageUrl: string) => Promise<{ success: boolean; url?: string; error?: string }>;
      getCachedImage: (imageUrl: string) => Promise<{ success: boolean; url: string }>;
      cacheImages: (imageUrls: string[]) => Promise<{ success: boolean; urls?: Record<string, string>; error?: string }>;
      onOnlineStatusChange: (callback: (isOnline: boolean) => void) => void | (() => void);
    };
  }
}

export {};

