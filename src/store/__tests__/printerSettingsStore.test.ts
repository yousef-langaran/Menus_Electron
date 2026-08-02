import { describe, it, expect, beforeEach, vi } from 'vitest';
import { usePrinterSettingsStore, type PrinterConfig } from '../printerSettingsStore';

const STORAGE_KEY = 'printerConfigs';

const savePrinterConfigs = vi.fn().mockResolvedValue(undefined);
const loadPrinterConfigs = vi.fn().mockResolvedValue({});

const printer = { name: 'EPSON-TM-T20', displayName: 'صندوق' };

const storedConfigs = (): Record<string, PrinterConfig> =>
  JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');

const enable = (p = printer) =>
  usePrinterSettingsStore.getState().setPrinterEnabled(p, true);

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  usePrinterSettingsStore.setState({ configs: {} });
  vi.spyOn(console, 'error').mockImplementation(() => {});
  (window as any).electronAPI = { savePrinterConfigs, loadPrinterConfigs };
});

describe('setPrinterEnabled', () => {
  it('creates a config with sensible 80mm defaults for an unknown printer', () => {
    enable();

    const config = usePrinterSettingsStore.getState().configs[printer.name];
    expect(config).toEqual({
      name: printer.name,
      displayName: 'صندوق',
      paperWidth: 80,
      paperLength: 200,
      margin: 5,
      enabled: true,
      receipts: [
        { type: 'full', enabled: true, copies: 1 },
        { type: 'kitchen', enabled: false, copies: 1 },
      ],
    });
  });

  it('toggles an existing printer without discarding its paper settings', () => {
    enable();
    usePrinterSettingsStore.getState().updatePrinterConfig(printer.name, { paperWidth: 58 });

    usePrinterSettingsStore.getState().setPrinterEnabled(printer, false);

    const config = usePrinterSettingsStore.getState().configs[printer.name];
    expect(config.enabled).toBe(false);
    expect(config.paperWidth).toBe(58);
  });

  it('keeps the previous display name when the new one is blank', () => {
    enable();

    usePrinterSettingsStore.getState().setPrinterEnabled({ name: printer.name }, true);

    expect(usePrinterSettingsStore.getState().configs[printer.name].displayName).toBe('صندوق');
  });

  it('persists to localStorage', () => {
    enable();

    expect(storedConfigs()[printer.name].enabled).toBe(true);
  });

  it('mirrors the configs to the main process over the preload bridge', () => {
    enable();

    expect(savePrinterConfigs).toHaveBeenCalledWith(
      expect.objectContaining({ [printer.name]: expect.objectContaining({ enabled: true }) }),
    );
  });

  it('does not throw when the bridge rejects the save', () => {
    savePrinterConfigs.mockRejectedValueOnce(new Error('ipc down'));

    expect(() => enable()).not.toThrow();
  });
});

describe('updatePrinterConfig', () => {
  it('merges the partial into the existing config', () => {
    enable();

    usePrinterSettingsStore
      .getState()
      .updatePrinterConfig(printer.name, { paperWidth: 58, margin: 2 });

    const config = usePrinterSettingsStore.getState().configs[printer.name];
    expect(config.paperWidth).toBe(58);
    expect(config.margin).toBe(2);
    expect(config.paperLength).toBe(200);
  });

  it('ignores an update for a printer that was never configured', () => {
    usePrinterSettingsStore.getState().updatePrinterConfig('ghost', { paperWidth: 58 });

    expect(usePrinterSettingsStore.getState().configs).toEqual({});
    expect(savePrinterConfigs).not.toHaveBeenCalled();
  });

  it('backfills the receipt list when an older config lacks one', () => {
    usePrinterSettingsStore.setState({
      configs: { legacy: { name: 'legacy', paperWidth: 80, paperLength: 200, margin: 5, enabled: true } as PrinterConfig },
    });

    usePrinterSettingsStore.getState().updatePrinterConfig('legacy', { margin: 3 });

    expect(usePrinterSettingsStore.getState().configs.legacy.receipts).toEqual([
      { type: 'full', enabled: true, copies: 1 },
      { type: 'kitchen', enabled: false, copies: 1 },
    ]);
  });
});

describe('setReceiptEnabled', () => {
  it('turns the kitchen receipt on without touching the full receipt', () => {
    enable();

    usePrinterSettingsStore.getState().setReceiptEnabled(printer.name, 'kitchen', true);

    const receipts = usePrinterSettingsStore.getState().getPrinterReceipts(printer.name);
    expect(receipts).toEqual([
      { type: 'full', enabled: true, copies: 1 },
      { type: 'kitchen', enabled: true, copies: 1 },
    ]);
  });

  it('ignores an unknown printer', () => {
    usePrinterSettingsStore.getState().setReceiptEnabled('ghost', 'full', false);

    expect(usePrinterSettingsStore.getState().configs).toEqual({});
  });
});

describe('setReceiptCopies', () => {
  it('sets the copy count for one receipt type only', () => {
    enable();

    usePrinterSettingsStore.getState().setReceiptCopies(printer.name, 'full', 3);

    const receipts = usePrinterSettingsStore.getState().getPrinterReceipts(printer.name);
    expect(receipts.find((r) => r.type === 'full')!.copies).toBe(3);
    expect(receipts.find((r) => r.type === 'kitchen')!.copies).toBe(1);
  });

  // A misconfigured copy count would spool paper endlessly on a thermal printer.
  it.each([
    [0, 1],
    [-5, 1],
    [6, 5],
    [999, 5],
  ])('clamps a requested count of %i to %i', (requested, expected) => {
    enable();

    usePrinterSettingsStore.getState().setReceiptCopies(printer.name, 'full', requested);

    expect(
      usePrinterSettingsStore
        .getState()
        .getPrinterReceipts(printer.name)
        .find((r) => r.type === 'full')!.copies,
    ).toBe(expected);
  });

  it('ignores an unknown printer', () => {
    usePrinterSettingsStore.getState().setReceiptCopies('ghost', 'full', 2);

    expect(usePrinterSettingsStore.getState().configs).toEqual({});
  });
});

describe('getEnabledPrinters', () => {
  it('is empty before anything is configured', () => {
    expect(usePrinterSettingsStore.getState().getEnabledPrinters()).toEqual([]);
  });

  it('returns only the enabled printers', () => {
    enable();
    enable({ name: 'SECOND', displayName: 'آشپزخانه' });
    usePrinterSettingsStore.getState().setPrinterEnabled({ name: 'SECOND' }, false);

    const enabled = usePrinterSettingsStore.getState().getEnabledPrinters();
    expect(enabled.map((p) => p.name)).toEqual([printer.name]);
  });
});

describe('getPrinterReceipts', () => {
  it('returns an empty list for an unknown printer', () => {
    expect(usePrinterSettingsStore.getState().getPrinterReceipts('ghost')).toEqual([]);
  });

  it('falls back to the default pair for a config saved before receipts existed', () => {
    usePrinterSettingsStore.setState({
      configs: { legacy: { name: 'legacy', paperWidth: 80, paperLength: 200, margin: 5, enabled: true } as PrinterConfig },
    });

    expect(usePrinterSettingsStore.getState().getPrinterReceipts('legacy')).toEqual([
      { type: 'full', enabled: true, copies: 1 },
      { type: 'kitchen', enabled: false, copies: 1 },
    ]);
  });
});

describe('loadFromStorage', () => {
  it('prefers the configs held by the main process', async () => {
    loadPrinterConfigs.mockResolvedValue({
      remote: { name: 'remote', paperWidth: 58, paperLength: 100, margin: 1, enabled: true, receipts: [] },
    });

    await usePrinterSettingsStore.getState().loadFromStorage();

    expect(usePrinterSettingsStore.getState().configs.remote.paperWidth).toBe(58);
  });

  it('caches the main-process configs into localStorage', async () => {
    loadPrinterConfigs.mockResolvedValue({
      remote: { name: 'remote', paperWidth: 58, paperLength: 100, margin: 1, enabled: true, receipts: [] },
    });

    await usePrinterSettingsStore.getState().loadFromStorage();

    expect(storedConfigs().remote).toBeDefined();
  });

  it('falls back to localStorage when the bridge returns nothing', async () => {
    loadPrinterConfigs.mockResolvedValue({});
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ local: { name: 'local', paperWidth: 80, enabled: true } }),
    );

    await usePrinterSettingsStore.getState().loadFromStorage();

    expect(usePrinterSettingsStore.getState().configs.local).toBeDefined();
  });

  it('falls back to localStorage when the bridge throws', async () => {
    loadPrinterConfigs.mockRejectedValue(new Error('ipc down'));
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ local: { name: 'local', paperWidth: 80, enabled: true } }),
    );

    await usePrinterSettingsStore.getState().loadFromStorage();

    expect(usePrinterSettingsStore.getState().configs.local).toBeDefined();
  });

  it('starts empty when the cached JSON is corrupted rather than crashing the POS', async () => {
    loadPrinterConfigs.mockResolvedValue({});
    localStorage.setItem(STORAGE_KEY, '{not json');

    await usePrinterSettingsStore.getState().loadFromStorage();

    expect(usePrinterSettingsStore.getState().configs).toEqual({});
  });

  it('works with no preload bridge at all (plain browser dev)', async () => {
    delete (window as any).electronAPI;
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ local: { name: 'local', paperWidth: 80, enabled: true } }),
    );

    await usePrinterSettingsStore.getState().loadFromStorage();

    expect(usePrinterSettingsStore.getState().configs.local).toBeDefined();
  });
});
