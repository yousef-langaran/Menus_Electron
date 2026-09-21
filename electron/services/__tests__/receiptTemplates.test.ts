import { describe, it, expect, vi } from 'vitest';

// printer.ts فقط برای پنجرهٔ چاپ به electron نیاز دارد؛ تولید HTML مستقل است.
vi.mock('electron', () => ({ BrowserWindow: class {} }));
vi.mock('../../database/preferences', () => ({
  getNextReceiptNumber: vi.fn(),
  getReceiptNumbersMap: vi.fn(() => ({})),
  setReceiptNumbersForOrder: vi.fn(),
  loadReceiptPriceDisplayUnit: vi.fn(async () => 'toman'),
}));
// موفقیت را با نوشتن یک PNG واقعی روی دیسک شبیه‌سازی می‌کند (تا fs.readFileSync واقعیِ
// printer.ts فایلی برای خواندن داشته باشد)، و شکست دانلود را برای URLهای حاوی "unreachable".
vi.mock('../imageCache', () => ({
  cacheImage: vi.fn(async (url: string) => {
    if (url.includes('unreachable')) {
      throw new Error('ENOTFOUND (simulated)');
    }
    const fs = await import('fs');
    const os = await import('os');
    const path = await import('path');
    const filePath = path.join(os.tmpdir(), `test-print-image-${Buffer.from(url).toString('hex')}.png`);
    const onePxPng = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
      'base64',
    );
    fs.writeFileSync(filePath, onePxPng);
    return filePath;
  }),
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

  it('is appended to a server template receipt', async () => {
    const html = await generateReceiptHTMLFromLayout(orderData, layout([callNumberBlock]), {
      receiptNumber: 12,
    });
    expect(html).toContain(BRAND);
    expect(html).toContain('با تشکر از انتخاب شما');
  });

  it('does not repeat the thank-you line when the template already has a footer block', async () => {
    const html = await generateReceiptHTMLFromLayout(
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
  it('uses the same top-spacing reset as the built-in template', async () => {
    const html = await generateReceiptHTMLFromLayout(orderData, layout([callNumberBlock]), {
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
  it('skips the call-number box when there is no call number', async () => {
    const html = await generateReceiptHTMLFromLayout(orderData, layout([callNumberBlock]), {
      receiptNumber: 0,
    });
    expect(html).not.toContain('display:inline-flex');
  });

  it('prints the call-number box when a number exists', async () => {
    const html = await generateReceiptHTMLFromLayout(orderData, layout([callNumberBlock]), {
      receiptNumber: 41,
    });
    expect(html).toContain('41');
    expect(html).toContain('display:inline-flex');
  });
});

describe('image module: embeds an offline-safe data URI instead of a live remote src', () => {
  // پنجرهٔ چاپ با data:text/html بارگذاری می‌شود؛ عکسی که فقط با src=آدرس ریموت چاپ
  // می‌شد، به دانلود زندهٔ آن در لحظهٔ چاپ وابسته بود و اگر شبکهٔ صندوق آن لحظه کند/قطع
  // بود یا خودِ دانلود صرفاً کند بود، بدون هیچ خطایی چاپ می‌شد بدون عکس (P0 واقعی که این
  // تست از تکرارش جلوگیری می‌کند).
  const imageBlock = (imageUrl: string) => ({
    id: 'img1',
    type: 'image',
    label: 'تصویر',
    visible: true,
    order: 0,
    options: { imageUrl },
  });

  it('replaces a cacheable image URL with an embedded base64 data URI', async () => {
    const html = await generateReceiptHTMLFromLayout(
      orderData,
      layout([imageBlock('https://cdn.example.com/logo.png')]),
      {},
    );
    expect(html).toContain('data:image/png;base64,');
    expect(html).not.toContain('https://cdn.example.com/logo.png');
  });

  it('falls back to the original remote URL (old behavior) when caching fails, without throwing', async () => {
    const html = await generateReceiptHTMLFromLayout(
      orderData,
      layout([imageBlock('https://unreachable.example.com/logo.png')]),
      {},
    );
    expect(html).toContain('https://unreachable.example.com/logo.png');
  });
});
