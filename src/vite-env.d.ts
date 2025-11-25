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
  copies?: number;
};

declare global {
  interface Window {
    electronAPI?: {
      checkOnline: () => Promise<boolean>;
      syncOrders: (token?: string) => Promise<any>;
      printReceipt: (orderData: any, printerJobs: ElectronPrinterJob[]) => Promise<{ success: boolean; error?: string }>;
      getPrinters: () => Promise<Array<{ name: string; displayName: string; description: string }>>;
      showMessageBox: (options: any) => Promise<any>;
      saveOfflineOrder: (
        orderData: any,
        token: string,
        baseURL?: string
      ) => Promise<{ success: boolean; orderId?: number; error?: string }>;
      getOfflineOrders: () => Promise<any[]>;
      generateReceiptPreview: (
        orderData: any,
        options?: { paperWidth?: number; margin?: number }
      ) => Promise<{ success: boolean; html?: string; imageDataUrl?: string; error?: string }>;
      loadUserSession: () => Promise<{ user: any; token: string; cachedAt: string } | null>;
      saveUserSession: (data: { user: any; token: string }) => Promise<{ success: boolean; error?: string }>;
      clearUserSession: () => Promise<{ success: boolean; error?: string }>;
      loadPrinterConfigs: () => Promise<Record<string, any>>;
      savePrinterConfigs: (configs: Record<string, any>) => Promise<{ success: boolean; error?: string }>;
      onOnlineStatusChange: (callback: (isOnline: boolean) => void) => void | (() => void);
    };
  }
}

export {};

