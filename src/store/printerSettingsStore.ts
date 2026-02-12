import { create } from 'zustand';

export type ReceiptType = 'full' | 'kitchen'; // full = با قیمت، kitchen = بدون قیمت

export interface ReceiptConfig {
  type: ReceiptType;
  enabled: boolean;
  copies: number;
}

export interface PrinterConfig {
  name: string;
  displayName?: string;
  paperWidth: number; // mm
  paperLength: number; // mm
  margin: number; // mm
  enabled: boolean;
  receipts: ReceiptConfig[]; // لیست رسیدهای مختلف برای این پرینتر
}

interface PrinterSettingsState {
  configs: Record<string, PrinterConfig>;
  setPrinterEnabled: (printer: { name: string; displayName?: string }, enabled: boolean) => void;
  updatePrinterConfig: (printerName: string, partial: Partial<PrinterConfig>) => void;
  setReceiptEnabled: (printerName: string, receiptType: ReceiptType, enabled: boolean) => void;
  setReceiptCopies: (printerName: string, receiptType: ReceiptType, copies: number) => void;
  getEnabledPrinters: () => PrinterConfig[];
  getPrinterReceipts: (printerName: string) => ReceiptConfig[];
  loadFromStorage: () => Promise<void>;
}

const STORAGE_KEY = 'printerConfigs';

const readFromLocalStorage = (): Record<string, PrinterConfig> => {
  if (typeof window === 'undefined') {
    return {};
  }
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    return JSON.parse(raw);
  } catch (error) {
    console.error('Failed to load printer configs:', error);
    return {};
  }
};

const hasElectronBridge = () => typeof window !== 'undefined' && Boolean(window.electronAPI);

const persistConfigs = (configs: Record<string, PrinterConfig>) => {
  if (typeof window !== 'undefined') {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(configs));
    } catch (error) {
      console.error('Failed to save printer configs:', error);
    }
  }

  if (hasElectronBridge() && window.electronAPI?.savePrinterConfigs) {
    window.electronAPI
      .savePrinterConfigs(configs)
      .catch((error) => console.error('Failed to save printer configs via electron bridge:', error));
  }
};

export const usePrinterSettingsStore = create<PrinterSettingsState>((set, get) => ({
  configs: {},

  loadFromStorage: async () => {
    if (hasElectronBridge() && window.electronAPI?.loadPrinterConfigs) {
      try {
        const remoteConfigs = await window.electronAPI.loadPrinterConfigs();
        if (remoteConfigs && Object.keys(remoteConfigs).length > 0) {
          set({ configs: remoteConfigs });
          window.localStorage?.setItem(STORAGE_KEY, JSON.stringify(remoteConfigs));
          return;
        }
      } catch (error) {
        console.error('Failed to load printer configs via electron bridge:', error);
      }
    }
    set({ configs: readFromLocalStorage() });
  },

  setPrinterEnabled: (printer, enabled) => {
    set((state) => {
      const current = state.configs[printer.name] || {
        name: printer.name,
        displayName: printer.displayName,
        paperWidth: 80,
        paperLength: 200,
        margin: 5,
        enabled: false,
        receipts: [
          { type: 'full', enabled: true, copies: 1 },
          { type: 'kitchen', enabled: false, copies: 1 },
        ],
      };
      const updated = {
        ...state.configs,
        [printer.name]: {
          ...current,
          enabled,
          displayName: printer.displayName || current.displayName,
          receipts: current.receipts || [
            { type: 'full', enabled: true, copies: 1 },
            { type: 'kitchen', enabled: false, copies: 1 },
          ],
        },
      };
      persistConfigs(updated);
      return { configs: updated };
    });
  },

  updatePrinterConfig: (printerName, partial) => {
    set((state) => {
      const existing = state.configs[printerName];
      if (!existing) return state;
      const updated = {
        ...state.configs,
        [printerName]: {
          ...existing,
          ...partial,
          receipts: existing.receipts || [
            { type: 'full', enabled: true, copies: 1 },
            { type: 'kitchen', enabled: false, copies: 1 },
          ],
        },
      };
      persistConfigs(updated);
      return { configs: updated };
    });
  },

  setReceiptEnabled: (printerName, receiptType, enabled) => {
    set((state) => {
      const existing = state.configs[printerName];
      if (!existing) return state;
      
      const receipts = existing.receipts || [
        { type: 'full', enabled: true, copies: 1 },
        { type: 'kitchen', enabled: false, copies: 1 },
      ];
      
      const updatedReceipts = receipts.map(r => 
        r.type === receiptType ? { ...r, enabled } : r
      );
      
      const updated = {
        ...state.configs,
        [printerName]: {
          ...existing,
          receipts: updatedReceipts,
        },
      };
      persistConfigs(updated);
      return { configs: updated };
    });
  },

  setReceiptCopies: (printerName, receiptType, copies) => {
    set((state) => {
      const existing = state.configs[printerName];
      if (!existing) return state;
      
      const receipts = existing.receipts || [
        { type: 'full', enabled: true, copies: 1 },
        { type: 'kitchen', enabled: false, copies: 1 },
      ];
      
      const updatedReceipts = receipts.map(r => 
        r.type === receiptType ? { ...r, copies: Math.max(1, Math.min(5, copies)) } : r
      );
      
      const updated = {
        ...state.configs,
        [printerName]: {
          ...existing,
          receipts: updatedReceipts,
        },
      };
      persistConfigs(updated);
      return { configs: updated };
    });
  },

  getEnabledPrinters: () => {
    const configs = get().configs;
    return Object.values(configs).filter((config) => config.enabled);
  },

  getPrinterReceipts: (printerName) => {
    const config = get().configs[printerName];
    if (!config) return [];
    return config.receipts || [
      { type: 'full', enabled: true, copies: 1 },
      { type: 'kitchen', enabled: false, copies: 1 },
    ];
  },
}));


