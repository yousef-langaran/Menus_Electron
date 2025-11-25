import { create } from 'zustand';

export interface PrinterConfig {
  name: string;
  displayName?: string;
  paperWidth: number; // mm
  paperLength: number; // mm
  margin: number; // mm
  copies: number;
  enabled: boolean;
}

interface PrinterSettingsState {
  configs: Record<string, PrinterConfig>;
  setPrinterEnabled: (printer: { name: string; displayName?: string }, enabled: boolean) => void;
  updatePrinterConfig: (printerName: string, partial: Partial<PrinterConfig>) => void;
  getEnabledPrinters: () => PrinterConfig[];
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
        copies: 1,
        enabled: false,
      };
      const updated = {
        ...state.configs,
        [printer.name]: {
          ...current,
          enabled,
          displayName: printer.displayName || current.displayName,
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
}));


