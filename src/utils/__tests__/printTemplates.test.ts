import { describe, it, expect } from 'vitest';
import {
  buildPrinterJobs,
  normalizeTemplateLayout,
  resolveTemplateForPrinter,
  type PrintTemplateSnapshot,
} from '../printTemplates';
import type { PrinterConfig, ReceiptConfig } from '../../store/printerSettingsStore';

const template = (over: Partial<PrintTemplateSnapshot> = {}): PrintTemplateSnapshot => ({
  id: 7,
  name: 'قالب رستوران',
  paperWidth: 72,
  paperLength: 180,
  margin: 3,
  layout: { version: 2, rows: [{ id: 'r1', type: 'single', order: 0, blocks: [] }] },
  ...over,
});

const printer = (name: string): PrinterConfig => ({
  name,
  displayName: name,
  paperWidth: 80,
  paperLength: 200,
  margin: 5,
  enabled: true,
  receipts: [],
});

const bothReceipts = (): ReceiptConfig[] => [
  { type: 'full', enabled: true, copies: 2 },
  { type: 'kitchen', enabled: true, copies: 1 },
];

describe('normalizeTemplateLayout', () => {
  // سرور هر دو شکل را برمی‌گرداند؛ مسیر چاپ فقط نسخه ۲ را می‌شناسد.
  it('wraps a bare rows array into a v2 layout', () => {
    expect(normalizeTemplateLayout([{ id: 'r1' }])).toEqual({ version: 2, rows: [{ id: 'r1' }] });
  });

  it('keeps an already-v2 layout', () => {
    const raw = { version: 2, rows: [{ id: 'r1' }] };
    expect(normalizeTemplateLayout(raw)).toEqual(raw);
  });

  it.each([[null], [undefined], [[]], [{ version: 2, rows: [] }], [{ version: 1, rows: [{}] }]])(
    'returns undefined for %o',
    (raw) => {
      expect(normalizeTemplateLayout(raw)).toBeUndefined();
    },
  );
});

describe('resolveTemplateForPrinter', () => {
  it('falls back to the app default when the printer has no explicit choice', () => {
    const fallback = template();
    expect(resolveTemplateForPrinter('POS-2', {}, fallback)).toBe(fallback);
  });

  it('honours an explicit "no template" choice instead of the default', () => {
    expect(resolveTemplateForPrinter('POS-2', { 'POS-2': null }, template())).toBeNull();
  });

  it('prefers the printer-specific template', () => {
    const own = template({ id: 9 });
    expect(resolveTemplateForPrinter('POS-2', { 'POS-2': own }, template())).toBe(own);
  });

  it('prefers the per-receipt template over the printer one', () => {
    const perReceipt = template({ id: 21 });
    const perPrinter = template({ id: 22 });
    const map = { 'POS-1': perPrinter, 'POS-1::kitchen': perReceipt };

    expect(resolveTemplateForPrinter('POS-1', map, null, 'kitchen')).toBe(perReceipt);
    expect(resolveTemplateForPrinter('POS-1', map, null, 'full')).toBe(perPrinter);
  });

  it('lets one receipt opt out while the other keeps the printer template', () => {
    const perPrinter = template({ id: 22 });
    const map = { 'POS-1': perPrinter, 'POS-1::kitchen': null };

    expect(resolveTemplateForPrinter('POS-1', map, null, 'kitchen')).toBeNull();
    expect(resolveTemplateForPrinter('POS-1', map, null, 'full')).toBe(perPrinter);
  });
});

describe('buildPrinterJobs', () => {
  // مشکل گزارش‌شده: با دو رسید، فقط یکی با قالب انتخاب‌شده چاپ می‌شد.
  it('applies the same template to every enabled receipt of a printer', () => {
    const jobs = buildPrinterJobs([printer('POS-1')], bothReceipts, { 'POS-1': template() }, null);

    expect(jobs).toHaveLength(2);
    for (const job of jobs) {
      expect(job.layout).toEqual({ version: 2, rows: [{ id: 'r1', type: 'single', order: 0, blocks: [] }] });
      expect(job.paperWidth).toBe(72);
      expect(job.margin).toBe(3);
    }
    expect(jobs.map((j) => j.receiptType)).toEqual(['full', 'kitchen']);
    expect(jobs.map((j) => j.copies)).toEqual([2, 1]);
  });

  // خواستهٔ کاربر: دو فیش از یک پرینتر با دو قالب متفاوت
  it('gives each receipt of one printer its own template', () => {
    const fullTemplate = template({ id: 31, paperWidth: 80, layout: [{ id: 'full-row' }] });
    const kitchenTemplate = template({ id: 32, paperWidth: 58, layout: [{ id: 'kitchen-row' }] });

    const jobs = buildPrinterJobs([printer('POS-1')], bothReceipts, {
      'POS-1::full': fullTemplate,
      'POS-1::kitchen': kitchenTemplate,
    }, null);

    expect(jobs).toHaveLength(2);
    expect(jobs[0]).toMatchObject({ receiptType: 'full', paperWidth: 80 });
    expect(jobs[0].layout).toEqual({ version: 2, rows: [{ id: 'full-row' }] });
    expect(jobs[1]).toMatchObject({ receiptType: 'kitchen', paperWidth: 58 });
    expect(jobs[1].layout).toEqual({ version: 2, rows: [{ id: 'kitchen-row' }] });
  });

  it('applies the default template to printers without an explicit choice', () => {
    const jobs = buildPrinterJobs(
      [printer('POS-1'), printer('POS-2')],
      () => [{ type: 'full', enabled: true, copies: 1 }],
      { 'POS-1': template() },
      template(),
    );

    expect(jobs).toHaveLength(2);
    expect(jobs.every((j) => j.layout !== undefined)).toBe(true);
  });

  it('normalizes a legacy array layout so print does not silently fall back', () => {
    const jobs = buildPrinterJobs(
      [printer('POS-1')],
      () => [{ type: 'full', enabled: true, copies: 1 }],
      { 'POS-1': template({ layout: [{ id: 'r1' }] }) },
      null,
    );

    expect(jobs[0].layout).toEqual({ version: 2, rows: [{ id: 'r1' }] });
  });

  it('forwards the template paper geometry and skips disabled receipts', () => {
    const jobs = buildPrinterJobs(
      [printer('POS-1')],
      () => [
        { type: 'full', enabled: true, copies: 1 },
        { type: 'kitchen', enabled: false, copies: 1 },
      ],
      { 'POS-1': template({ contentWidthMm: 58, shiftLeftMm: 4 }) },
      null,
    );

    expect(jobs).toHaveLength(1);
    expect(jobs[0].contentWidthMm).toBe(58);
    expect(jobs[0].shiftLeftMm).toBe(4);
  });

  it('falls back to the printer config when no template is selected', () => {
    const jobs = buildPrinterJobs(
      [printer('POS-1')],
      () => [{ type: 'full', enabled: true, copies: 1 }],
      { 'POS-1': null },
      template(),
    );

    expect(jobs[0].layout).toBeUndefined();
    expect(jobs[0].paperWidth).toBe(80);
    expect(jobs[0].margin).toBe(5);
  });
});
