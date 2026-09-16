import { describe, it, expect, vi } from 'vitest';

// printer.ts فقط برای پنجرهٔ چاپ به electron نیاز دارد؛ تولید HTML مستقل است.
vi.mock('electron', () => ({ BrowserWindow: class {} }));
vi.mock('../../database/preferences', () => ({
  getNextReceiptNumber: vi.fn(),
  getReceiptNumbersMap: vi.fn(() => ({})),
  setReceiptNumbersForOrder: vi.fn(),
  loadReceiptPriceDisplayUnit: vi.fn(async () => 'toman'),
}));

const {
  normalizeReceiptLayout,
  generateReceiptHTML,
  generateReceiptHTMLFromLayout,
  generateKitchenReceiptHTML,
} = await import('../printer');

const BRAND = 'secoin.ir';

const orderData = {
  orderNumber: 'A-1',
  restaurantName: 'رستوران تست',
  items: [{ productName: 'چای', quantity: 1, price: 5000 }],
  totalAmount: 5000,
  finalAmount: 5000,
};

const layout = (blocks: unknown[]) => ({
  version: 2 as const,
  rows: [{ id: 'r1', type: 'single' as const, order: 0, blocks: blocks as any }],
});

const callNumberBlock = {
  id: 'b1',
  type: 'call_number',
  label: 'شماره فراخوانی',
  visible: true,
  order: 0,
};

describe('normalizeReceiptLayout', () => {
  it('accepts both the bare rows array and the v2 object', () => {
    expect(normalizeReceiptLayout([{ id: 'r1' }])).toEqual({ version: 2, rows: [{ id: 'r1' }] });
    expect(normalizeReceiptLayout({ version: 2, rows: [{ id: 'r1' }] })).toEqual({
      version: 2,
      rows: [{ id: 'r1' }],
    });
  });

  it('rejects empty or unknown shapes', () => {
    expect(normalizeReceiptLayout(null)).toBeUndefined();
    expect(normalizeReceiptLayout([])).toBeUndefined();
    expect(normalizeReceiptLayout({ version: 1, rows: [{}] })).toBeUndefined();
  });
});

describe('brand footer', () => {
  // معرفی نرم‌افزار باید زیر همهٔ قالب‌ها بیاید، نه فقط قالب پیش‌فرض.
  it('is present on the built-in full receipt', () => {
    expect(generateReceiptHTML(orderData)).toContain(BRAND);
  });

  it('is present on the kitchen receipt', () => {
    expect(generateKitchenReceiptHTML(orderData)).toContain(BRAND);
  });

  it('is appended to a server template receipt', () => {
    const html = generateReceiptHTMLFromLayout(orderData, layout([callNumberBlock]), {
      receiptNumber: 12,
    });
    expect(html).toContain(BRAND);
    expect(html).toContain('با تشکر از انتخاب شما');
  });

  it('does not repeat the thank-you line when the template already has a footer block', () => {
    const html = generateReceiptHTMLFromLayout(
      orderData,
      layout([{ id: 'f1', type: 'footer', label: 'فوتر', visible: true, order: 0 }]),
      {},
    );
    expect(html).toContain(BRAND);
    expect(html.match(/با تشکر از انتخاب شما/g) ?? []).toHaveLength(1);
  });
});

describe('item line note (e.g. free-reward label)', () => {
  // قبلاً در generateReceiptHTML، itemNote/itemOption محاسبه می‌شد ولی هیچ‌وقت
  // در ردیف آیتم چاپ نمی‌شد — پس مثلاً برچسب «رایگان (جایزهٔ امتیازی)» یک
  // آیتم قیمت-صفرِ جایزهٔ امتیازی روی فاکتور چاپی گم می‌شد.
  it('renders itemNote under the item name on the built-in priced receipt', () => {
    const html = generateReceiptHTML({
      ...orderData,
      items: [{ productName: 'قهوه ترک', quantity: 1, price: 0, itemNote: 'رایگان (جایزهٔ امتیازی)' }],
    });
    expect(html).toContain('رایگان (جایزهٔ امتیازی)');
  });

  it('falls back to itemOption when itemNote is absent (Electron cart snapshot field name)', () => {
    const html = generateReceiptHTML({
      ...orderData,
      items: [{ productName: 'قهوه ترک', quantity: 1, price: 0, itemOption: 'رایگان (جایزهٔ امتیازی)' }],
    });
    expect(html).toContain('رایگان (جایزهٔ امتیازی)');
  });
});

describe('generateReceiptHTMLFromLayout page geometry', () => {
  it('uses the same top-spacing reset as the built-in template', () => {
    const html = generateReceiptHTMLFromLayout(orderData, layout([callNumberBlock]), {
      paperWidth: 80,
      contentWidthMm: 64,
      receiptNumber: 3,
    });
    expect(html).toContain('padding-top: 0 !important');
    expect(html).toContain('padding-top: 0;');
    expect(html).toContain('--printable-width: 64mm');
    expect(html).toContain('--paper-width: 80mm');
  });

  // کادر خالیِ شمارهٔ فراخوانی، فضای سفید بزرگی بالای رسید ایجاد می‌کرد.
  it('skips the call-number box when there is no call number', () => {
    const html = generateReceiptHTMLFromLayout(orderData, layout([callNumberBlock]), {
      receiptNumber: 0,
    });
    expect(html).not.toContain('display:inline-flex');
  });

  it('prints the call-number box when a number exists', () => {
    const html = generateReceiptHTMLFromLayout(orderData, layout([callNumberBlock]), {
      receiptNumber: 41,
    });
    expect(html).toContain('41');
    expect(html).toContain('display:inline-flex');
  });
});
