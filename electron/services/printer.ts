import * as path from 'path';
import { BrowserWindow } from 'electron';
import { getNextReceiptNumber, setReceiptNumbersForOrder } from '../database/preferences';

/** نگهداری تنظیمات چاپ پنجرهٔ پیش‌نمایش برای استفاده در IPC */
export const printPreviewOptsMap = new Map<number, any>();

export type ReceiptType = 'full' | 'kitchen';

/** قالب نسخه ۲ از طراح فیش (ردیف/ستون) */
export interface ReceiptLayoutV2 {
  version: 2;
  rows: ReceiptLayoutRow[];
}

interface ReceiptLayoutRow {
  id: string;
  type: 'single' | 'columns';
  order: number;
  blocks: ReceiptLayoutModule[] | ReceiptLayoutModule[][];
  columnCount?: number;
  /** نسبت عرض ستون‌ها (مثلاً [2, 1]) */
  columnWidths?: number[];
}

interface ReceiptLayoutModule {
  id: string;
  type: string;
  label: string;
  visible: boolean;
  order: number;
  options?: Record<string, unknown>;
}

export interface PrinterJob {
  name: string;
  displayName?: string;
  paperWidth?: number; // mm
  paperLength?: number; // mm
  margin?: number; // mm
  receiptType?: ReceiptType;
  copies?: number;
  /** اگر قالب طراح (نسخه ۲) باشد، چاپ بر اساس layout انجام می‌شود */
  layout?: ReceiptLayoutV2;
}

interface ReceiptTemplateOptions {
  paperWidth?: number;
  paperLength?: number;
  margin?: number;
  receiptNumber?: number;
  /** عرض واقعی ناحیه چاپ (mm) تا محتوا بریده نشود */
  contentWidthMm?: number;
  /** فاصله خالی سمت راست کاغذ (mm) تا محتوا به چپ برود — با margin-right در CSS */
  shiftLeftMm?: number;
  /** قالب طراح (نسخه ۲) برای پیش‌نمایش/چاپ هماهنگ با چاپ واقعی */
  layout?: ReceiptLayoutV2;
  /** برای پیش‌نمایش: رسید کامل یا آشپزخانه */
  receiptType?: ReceiptType;
}

const mmToMicrons = (value: number) => Math.max(1, Math.round(value * 1000));

export async function printReceipt(
  orderData: any,
  printerJobs: PrinterJob[],
  orderKeys?: string | string[]
): Promise<number> {
  if (!printerJobs || printerJobs.length === 0) {
    throw new Error('No printers selected');
  }

  let keys: string[] = Array.isArray(orderKeys) ? [...orderKeys] : orderKeys ? [orderKeys] : [];
  if (!keys.length && orderData && (orderData.id != null || orderData.orderNumber)) {
    keys = [String(orderData.id), orderData.orderNumber].filter(Boolean);
  }
  // اگر بک‌اند شماره فراخوانی داده (سفارش آنلاین)، همان را برای چاپ و ذخیره استفاده کن
  const receiptNumber =
    orderData?.receiptCallNumber != null && Number.isInteger(orderData.receiptCallNumber)
      ? Number(orderData.receiptCallNumber)
      : await getNextReceiptNumber();
  if (keys.length) {
    setReceiptNumbersForOrder(keys.map((k) => String(k)), receiptNumber);
  }

  // گروه‌بندی jobها بر اساس پرینتر و نوع رسید
  const jobsByPrinter = new Map<string, PrinterJob[]>();
  for (const job of printerJobs) {
    const key = job.name;
    if (!jobsByPrinter.has(key)) {
      jobsByPrinter.set(key, []);
    }
    jobsByPrinter.get(key)!.push(job);
  }

  // چاپ برای هر پرینتر
  for (const [printerName, jobs] of jobsByPrinter.entries()) {
    const printWindow = new BrowserWindow({
      show: false,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
      },
    });

    const defaultConfig = jobs[0];
    const margin = defaultConfig?.margin ?? 5;

    // چاپ هر نوع رسید برای این پرینتر
    for (const job of jobs) {
      try {
        const paperWidth = job.paperWidth ?? defaultConfig?.paperWidth ?? 80;
        const isNarrow = paperWidth <= 62;
        const marginSame = 5;
        const shiftLeftMm = isNarrow ? 4 : 6;
        const contentWidthMm = Math.max(32, paperWidth - marginSame * 2 - shiftLeftMm);
        const marginTop = 0;
        const marginBottom = 3;

        const receiptType = job.receiptType || 'full';
        const opts = { paperWidth, margin, receiptNumber, contentWidthMm, shiftLeftMm, receiptType };
        const receiptHTML = job.layout?.version === 2
          ? generateReceiptHTMLFromLayout(orderData, job.layout, opts)
          : receiptType === 'kitchen'
            ? generateKitchenReceiptHTML(orderData, opts)
            : generateReceiptHTML(orderData, opts);

        await printWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(receiptHTML)}`);
        await new Promise(resolve => setTimeout(resolve, 1000));

        const width = mmToMicrons(paperWidth);
        const height = mmToMicrons(job.paperLength ?? 200);
        const copies = Math.max(1, Math.floor(job.copies ?? 1));
        const cssWidthValue = paperWidth.toFixed(2);
        const cssContentWidth = contentWidthMm.toFixed(2);

        try {
          await printWindow.webContents.executeJavaScript(`
            document.documentElement.style.setProperty('--paper-width', '${cssWidthValue}mm');
            document.documentElement.style.setProperty('--printable-width', '${cssContentWidth}mm');
            document.documentElement.style.setProperty('--content-padding', '2mm');
          `);
        } catch (styleError) {
          console.warn('Failed to apply dynamic paper style variables:', styleError);
        }

        for (let i = 0; i < copies; i++) {
          await new Promise<void>((resolve, reject) => {
            printWindow.webContents.print(
              {
                silent: true,
                printBackground: true,
                deviceName: printerName,
                copies: 1,
                margins: {
                  marginType: 'custom',
                  top: marginTop,
                  bottom: marginBottom,
                  left: marginSame,
                  right: marginSame,
                } as any,
                pageSize: {
                  width,
                  height,
                },
              },
              (success: boolean, failureReason: string) => {
                if (success) {
                  resolve();
                } else {
                  reject(new Error(`Failed to print to ${printerName}: ${failureReason}`));
                }
              }
            );
          });
          await new Promise((resolve) => setTimeout(resolve, 500));
        }
      } catch (error) {
        console.error(`Error printing ${job.receiptType || 'full'} receipt to ${printerName}:`, error);
      }
    }

    printWindow.close();
  }

  return receiptNumber;
}

export function generateReceiptHTML(orderData: any, options: ReceiptTemplateOptions = {}): string {
  const items = orderData.items || [];
  const totalAmount = orderData.totalAmount || 0;
  const discountAmount = orderData.discountAmount || 0;
  const finalAmount = orderData.finalAmount || totalAmount - discountAmount;
  const orderNumber = orderData.orderNumber || orderData.order_number || orderData.id || 'N/A';
  const customerName = orderData.customerName || orderData.customerPhone || 'مشتری';
  const restaurantName = orderData.restaurantName || '';
  const serviceType = orderData.serviceType === 'dine_in' ? 'داخل سالن' : 'بیرون‌بر';
  const tableNumber = orderData.tableNumber || '';
  const customerAddress = orderData.customerAddress || '';
  const paymentMethod = getPaymentMethodText(orderData.paymentMethod);
  const notes = orderData.notes || '';
  const date = new Date().toLocaleString('fa-IR');

  const paperWidth = typeof options.paperWidth === 'number' ? options.paperWidth : 80;
  const printerMargin = typeof options.margin === 'number' ? Math.max(0, options.margin) : 5;
  const printableWidth = typeof options.contentWidthMm === 'number'
    ? options.contentWidthMm
    : Math.max(30, paperWidth - printerMargin * 2);
  const shiftLeftMm = typeof options.shiftLeftMm === 'number' ? options.shiftLeftMm : 0;
  const contentPadding = 2;
  const receiptNumber =
    options && typeof options.receiptNumber === 'number' ? options.receiptNumber : 0;

  return `
<!DOCTYPE html>
<html dir="rtl" lang="fa">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>رسید سفارش</title>
  <style>
    :root {
      --paper-width: ${paperWidth}mm;
      --printable-width: ${printableWidth}mm;
      --content-padding: ${contentPadding}mm;
      --shift-left: ${shiftLeftMm}mm;
    }
    @page {
      size: var(--paper-width) auto;
      margin: 0;
    }
    html, body {
      width: var(--paper-width);
      max-width: var(--paper-width);
      margin: 0;
      padding: 0;
      padding-top: 0 !important;
      margin-right: var(--shift-left);
    }
    body {
      font-family: 'Tahoma', 'Arial', sans-serif;
      font-size: 12px;
      box-sizing: border-box;
      direction: rtl;
      text-align: right;
      overflow-wrap: break-word;
      word-break: break-word;
      background: #fff;
      display: flex;
      justify-content: flex-start;
    }
    .receipt-root {
      width: var(--printable-width);
      max-width: var(--printable-width);
      padding: var(--content-padding);
      padding-top: 0;
      box-sizing: border-box;
      background: #fff;
      margin: 0;
    }
    * {
      box-sizing: border-box;
      max-width: 100%;
    }
    .header,
    .order-info,
    .items,
    .totals,
    .footer {
      width: 100%;
    }
    .header {
      text-align: center;
      border-bottom: 2px dashed #000;
      padding-top: 0 !important;
      padding-bottom: 6px;
      margin-top: 0 !important;
      margin-bottom: 6px;
    }
    .header h1 {
      margin: 0;
      font-size: 18px;
      font-weight: bold;
    }
    .order-info {
      margin: 10px 0;
    }
    .order-info div {
      margin: 5px 0;
    }
    .items {
      margin: 15px 0;
      border-top: 1px dashed #000;
      border-bottom: 1px dashed #000;
      padding: 10px 0;
    }
    .item {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      margin: 8px 0;
      padding: 5px 0;
      width: 100%;
    }
    .item-name-col {
      flex: 1;
      min-width: 0;
      padding-left: 4px;
    }
    .item-name {
      display: block;
    }
    .item-description {
      font-size: 10px;
      color: #555;
      margin-top: 3px;
      line-height: 1.35;
    }
    .item-line-note {
      font-size: 10px;
      color: #333;
      margin-top: 3px;
      line-height: 1.3;
    }
    .item-quantity {
      margin: 0 6px;
      white-space: nowrap;
    }
    .item-price {
      font-weight: bold;
      white-space: nowrap;
      margin-left: 4px;
    }
    .totals {
      margin: 15px 0;
    }
    .total-row {
      display: flex;
      justify-content: space-between;
      margin: 8px 0;
    }
    .total-row.final {
      font-size: 16px;
      font-weight: bold;
      border-top: 2px solid #000;
      padding-top: 10px;
      margin-top: 10px;
    }
    .footer {
      text-align: center;
      margin-top: 20px;
      padding-top: 10px;
      border-top: 2px dashed #000;
      font-size: 10px;
    }
    .receipt-fish-row {
      text-align: center;
      display: flex;
      gap: 4px;
      justify-content: space-between;
      margin: 8px 0;
    }
    .receipt-fish-label {
      display: block;
      font-size: 11px;
      margin-bottom: 4px;
    }
    .receipt-number-box {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 22mm;
      height: 22mm;
      min-width: 60px;
      min-height: 60px;
      margin: 0 auto;
      border: 3px solid #000;
      font-size: 28px;
      font-weight: bold;
      line-height: 1;
    }
    .receipt-restaurant-name {
      text-align: center;
      margin-top: 4px;
      font-size: 11px;
      font-weight: bold;
      max-width: 22mm;
      line-height: 1.2;
      word-break: break-word;
      overflow: hidden;
      display: -webkit-box;
      -webkit-line-clamp: 2;
      -webkit-box-orient: vertical;
    }
    .order-number-row {
      margin: 8px 0;
      font-size: 14px;
    }
    .order-number-label {
      display: block;
      font-size: 11px;
      color: #333;
      margin-bottom: 2px;
    }
    .order-number-value {
      display: block;
      font-size: 16px;
      font-weight: bold;
      letter-spacing: 0.5px;
    }
  </style>
</head>
<body>
  <div class="receipt-root">
    <div class="header">
<!--      <h1>بستنی حاج عبدالله</h1>-->
      <div class="receipt-fish-row">
        <div class="receipt-number-box">${receiptNumber > 0 ? receiptNumber : '—'}</div>
        <div class="receipt-restaurant-name">${restaurantName || 'رستوران'}</div>
      </div>
<!--      <div class="order-number-row">-->
<!--        <span class="order-number-label">شماره سفارش</span>-->
<!--        <span class="order-number-value">#${orderNumber}</span>-->
<!--      </div>-->
<!--      <div>${date}</div>-->
    </div>

    <div class="order-info">
      <div><strong>مشتری:</strong> ${customerName}</div>
      <div><strong>نوع سفارش:</strong> ${serviceType}</div>
      ${tableNumber ? `<div><strong>میز:</strong> ${tableNumber}</div>` : ''}
      ${customerAddress ? `<div><strong>آدرس:</strong> ${customerAddress}</div>` : ''}
<!--      <div><strong>روش پرداخت:</strong> ${paymentMethod}</div>-->
      ${notes ? `<div><strong>یادداشت:</strong> ${notes}</div>` : ''}
    </div>

    <div class="items">
      ${items.map((item: any) => {
        const title = item.product?.name_fa || item.productName || 'محصول';
        const desc = getProductDescription(item);
        const lineNote = getLineItemNote(item);
        return `
        <div class="item">
          <div class="item-name-col">
            <span class="item-name">${title}</span>
            ${desc ? `<div class="item-description">${desc}</div>` : ''}
            ${lineNote ? `<div class="item-line-note">یادداشت خط: ${lineNote}</div>` : ''}
          </div>
          <span class="item-quantity">${item.quantity} ×</span>
          <span class="item-price">${formatPrice(item.price)}</span>
        </div>
      `;
      }).join('')}
    </div>

    <div class="totals">
      <div class="total-row">
        <span>جمع کل:</span>
        <span>${formatPrice(totalAmount)}</span>
      </div>
      ${discountAmount > 0 ? `
      <div class="total-row">
        <span>تخفیف:</span>
        <span>-${formatPrice(discountAmount)}</span>
      </div>
      ` : ''}
      <div class="total-row final">
        <span>مبلغ نهایی:</span>
        <span>${formatPrice(finalAmount)}</span>
      </div>
    </div>

    <div class="footer">
      <div>با تشکر از انتخاب شما</div>
      <div>${date}</div>
    </div>
  </div>
</body>
</html>
  `;
}

export async function renderReceiptPreview(
  orderData: any,
  options: ReceiptTemplateOptions = {}
): Promise<{ html: string; imageDataUrl?: string }> {
  const receiptType = options.receiptType || 'full';
  const layout = options.layout;
  const useLayout = layout?.version === 2 && Array.isArray(layout?.rows) && layout.rows.length > 0;
  const html = receiptType === 'kitchen'
    ? generateKitchenReceiptHTML(orderData, options)
    : useLayout
      ? generateReceiptHTMLFromLayout(orderData, layout, options)
      : generateReceiptHTML(orderData, options);
  // برای پیش‌نمایش حاشیهٔ چپ و راست اضافه می‌کنیم تا محتوا از هیچ طرف بریده نشود
  const previewHtml = html.replace(
    '</head>',
    '<style id="preview-padding">html, body { padding-left: 24px !important; padding-right: 24px !important; box-sizing: border-box; }</style></head>'
  );

  const previewWindow = new BrowserWindow({
    show: false,
    width: 800,
    height: 3500,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      offscreen: true,
    },
  });

  await previewWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(previewHtml)}`);
  await new Promise((resolve) => setTimeout(resolve, 500));

  let imageDataUrl: string | undefined;
  try {
    // از getBoundingClientRect بدنه دقیقاً همان ناحیه‌ای را ضبط می‌کنیم که رسید رندر شده (با حاشیه امن)
    const rect = await previewWindow.webContents.executeJavaScript(
      `(function() {
        var body = document.body;
        var r = body.getBoundingClientRect();
        var pad = 16;
        return {
          x: Math.max(0, Math.round(r.left) - pad),
          y: Math.max(0, Math.round(r.top) - pad),
          width: Math.round(r.width) + pad * 2,
          height: Math.round(r.height) + pad * 2
        };
      })()`
    ).catch(() => ({ x: 0, y: 0, width: 400, height: 900 })) as { x: number; y: number; width: number; height: number };

    const x = Math.max(0, rect.x);
    const y = Math.max(0, rect.y);
    const w = Math.min(800, Math.max(280, rect.width));
    const h = Math.min(5000, Math.max(400, rect.height));
    const image = await previewWindow.webContents.capturePage({ x, y, width: w, height: h });
    imageDataUrl = image?.toDataURL();
  } catch (error) {
    console.warn('Failed to capture preview image:', error);
  } finally {
    previewWindow.destroy();
  }

  return { html, imageDataUrl };
}

/**
 * باز کردن پنجرهٔ پیش‌نمایش رسید؛ کاربر رسید را می‌بیند و با دکمه «چاپ» دیالوگ چاپ ویندوز باز می‌شود.
 * (اپ الکترون پیش‌نمایش دیالوگ ویندوز را پشتیبانی نمی‌کند، پس پیش‌نمایش همان پنجرهٔ ماست.)
 */
export function showSystemPrintDialog(
  orderData: any,
  options: ReceiptTemplateOptions & { receiptType?: ReceiptType } = {},
  printerName?: string
): Promise<void> {
  const receiptType = options.receiptType || 'full';
  const paperWidth = typeof options.paperWidth === 'number' ? options.paperWidth : 80;
  const margin = typeof options.margin === 'number' ? Math.max(0, options.margin) : 5;
  const isNarrow = paperWidth <= 62;
  const marginSame = 5;
  const shiftLeftMm = isNarrow ? 12 : 14;
  const contentWidthMm = typeof options.contentWidthMm === 'number' ? options.contentWidthMm : Math.max(32, paperWidth - marginSame * 2 - shiftLeftMm);
  const marginTop = 0;
  const marginBottom = 3;

  const html = receiptType === 'kitchen'
    ? generateKitchenReceiptHTML(orderData, { ...options, paperWidth, margin, contentWidthMm, shiftLeftMm })
    : generateReceiptHTML(orderData, { ...options, paperWidth, margin, contentWidthMm, shiftLeftMm });

  const width = mmToMicrons(paperWidth);
  const height = mmToMicrons(options.paperLength ?? 200);
  const printOpts: any = {
    silent: false,
    printBackground: true,
    copies: 1,
    margins: {
      marginType: 'custom',
      top: marginTop,
      bottom: marginBottom,
      left: marginSame,
      right: marginSame,
    },
    pageSize: { width, height },
  };
  if (printerName) printOpts.deviceName = printerName;

  const widthPx = Math.max(320, Math.min(500, Math.round((contentWidthMm / 25.4) * 96)));
  const preloadPath = path.join(__dirname, '..', 'preload-print-preview.js');
  const printWindow = new BrowserWindow({
    show: true,
    width: widthPx + 60,
    height: 680,
    title: receiptType === 'kitchen' ? 'پیش‌نمایش رسید آشپزخانه' : 'پیش‌نمایش رسید — قبل از چاپ',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: preloadPath,
    },
  });
  printWindow.setMenuBarVisibility(false);

  printPreviewOptsMap.set(printWindow.webContents.id, printOpts);
  printWindow.on('closed', () => {
    printPreviewOptsMap.delete(printWindow.webContents.id);
  });

  printWindow.webContents.once('did-finish-load', () => {
    const script = `
      (function() {
        if (document.getElementById('receipt-print-toolbar')) return;
        document.body.style.paddingBottom = '52px';
        var bar = document.createElement('div');
        bar.id = 'receipt-print-toolbar';
        bar.style.cssText = 'position:fixed;bottom:0;left:0;right:0;padding:10px;background:#f0f0f0;border-top:1px solid #ccc;text-align:center;direction:rtl;font-family:Tahoma;';
        bar.innerHTML = '<button id="receipt-btn-print" style="margin:0 8px;padding:8px 16px;cursor:pointer;">چاپ</button><button id="receipt-btn-close" style="margin:0 8px;padding:8px 16px;cursor:pointer;">بستن</button>';
        document.body.appendChild(bar);
        document.getElementById('receipt-btn-print').onclick = function() { if (typeof window.receiptPrint === 'function') window.receiptPrint(); };
        document.getElementById('receipt-btn-close').onclick = function() { window.close(); };
      })();
    `;
    printWindow.webContents.executeJavaScript(script).catch(() => {});
  });

  printWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`).catch(() => {});

  return Promise.resolve();
}

function formatPrice(price: number): string {
  return new Intl.NumberFormat('fa-IR').format(price) + ' تومان';
}

/** یادداشت خط سفارش — در اسنپ‌شات الکترون `itemOption` است، از API معمولاً `itemNote` */
function getLineItemNote(item: any): string {
  const n = item?.itemNote ?? item?.itemOption;
  return n != null ? String(n).trim() : '';
}

/** توضیحات ثبت‌شده در کارت محصول (منو) */
function getProductDescription(item: any): string {
  const d = item?.product?.description;
  return d != null ? String(d).trim() : '';
}

function getPaymentMethodText(method: string): string {
  const methods: { [key: string]: string } = {
    cash: 'نقد',
    card: 'کارت',
    online: 'آنلاین',
    mixed: 'ترکیبی',
  };
  return methods[method] || method;
}

function getValueForLayoutModule(type: string, orderData: any, module?: ReceiptLayoutModule): { value: string | number; isEmpty: boolean } {
  switch (type) {
    case 'call_number':
      return { value: orderData?.receiptCallNumber ?? 0, isEmpty: orderData?.receiptCallNumber == null };
    case 'restaurant_name':
      return { value: orderData?.restaurantName ?? '', isEmpty: !orderData?.restaurantName };
    case 'order_number':
      return { value: orderData?.orderNumber ?? orderData?.id ?? '—', isEmpty: !orderData?.orderNumber && orderData?.id == null };
    case 'date_time':
      return { value: new Date().toLocaleString('fa-IR'), isEmpty: false };
    case 'customer_name':
      return { value: orderData?.customerName ?? '', isEmpty: !orderData?.customerName };
    case 'customer_phone':
      return { value: orderData?.customerPhone ?? '', isEmpty: !orderData?.customerPhone };
    case 'address':
      return { value: orderData?.customerAddress ?? '', isEmpty: !orderData?.customerAddress };
    case 'order_info': {
      const st = orderData?.serviceType === 'dine_in' ? 'داخل سالن' : 'بیرون‌بر';
      const parts = [`نوع: ${st}`];
      if (orderData?.tableNumber) parts.push(`میز: ${orderData.tableNumber}`);
      if (orderData?.paymentMethod) parts.push(`پرداخت: ${getPaymentMethodText(orderData.paymentMethod)}`);
      return { value: parts.join(' | '), isEmpty: false };
    }
    case 'items':
      return { value: '', isEmpty: !orderData?.items?.length };
    case 'totals':
      return { value: '', isEmpty: false };
    case 'footer':
      return { value: 'با تشکر از انتخاب شما', isEmpty: false };
    case 'custom_text':
      return { value: (module?.options?.customText as string) ?? '', isEmpty: !(module?.options?.customText) };
    case 'divider':
      return { value: '—', isEmpty: false };
    case 'image':
      return { value: orderData?.logoUrl ?? '', isEmpty: !orderData?.logoUrl };
    default:
      return { value: '', isEmpty: false };
  }
}

function renderLayoutModuleHtml(module: ReceiptLayoutModule, orderData: any): string {
  const opt = module.options || {};
  const hideWhenEmpty = opt.hideWhenEmpty === true;
  const { value, isEmpty } = getValueForLayoutModule(module.type, orderData, module);
  if (!module.visible || (hideWhenEmpty && isEmpty)) return '';

  const fontSize = (opt.fontSize as number) ?? 11;
  const align = (opt.align as string) ?? 'right';
  const bold = opt.bold ? 'font-weight:bold;' : '';
  const padding = (opt.paddingMm as number) ?? 2;
  const borderWidth = opt.borderWidth as number | undefined;
  const borderStyle = (opt.borderStyle as string) ?? 'solid';
  const borderRadius = (opt.borderRadiusMm as number) ?? 0;
  let style = `font-size:${fontSize}pt;text-align:${align};padding:${padding}mm;border-radius:${borderRadius}mm;${bold}`;
  if (borderWidth) style += `border:${borderWidth}px ${borderStyle} #333;`;

  if (module.type === 'call_number') {
    const box = opt.showCallNumberBox !== false;
    const size = (opt.callNumberBoxSize as number) ?? 22;
    const v = orderData?.receiptCallNumber ?? value;
    if (box) {
      const boxBw = (opt.borderWidth as number) ?? 2;
      const boxBs = (opt.borderStyle as string) || 'solid';
      const boxBr = (opt.borderRadiusMm as number) ?? 0;
      const boxStyle = `display:inline-flex;align-items:center;justify-content:center;width:${size}mm;min-height:${size}mm;border:${boxBw}px ${boxBs} #333;border-radius:${boxBr}mm;font-weight:bold;`;
      return `<div style="${style.replace(/border:[^;]+;?/g, '')}display:flex;justify-content:center;"><span style="${boxStyle}">${v}</span></div>`;
    }
    return `<div style="${style}">${v}</div>`;
  }

  if (module.type === 'divider') {
    const lineStyle = (opt.lineStyle as string) ?? 'dashed';
    const thickness = (opt.lineThickness as number) ?? 1;
    return `<div style="${style}"><hr style="border:none;border-top:${thickness}px ${lineStyle} #333"/></div>`;
  }

  if (module.type === 'items' && orderData?.items?.length) {
    const showPrice = opt.showPrice !== false;
    const showDesc = opt.showDescription !== false;
    const showLineNote = opt.showItemNote !== false;
    const tableStyle = (opt.itemsTableStyle as string) ?? 'simple';
    const rows = orderData.items.map((item: any) => {
      const name = item.product?.name_fa || item.productName || 'محصول';
      const desc = showDesc ? getProductDescription(item) : '';
      const lineNote = showLineNote ? getLineItemNote(item) : '';
      const notePart = lineNote ? ` (${lineNote})` : '';
      const descBlock = desc
        ? `<div style="font-size:9pt;color:#555;margin-top:2px;line-height:1.3">${desc}</div>`
        : '';
      const price = showPrice ? `<td style="padding:2px 4px;vertical-align:top">${formatPrice(item.price)}</td>` : '';
      const border = tableStyle === 'bordered' ? 'border-bottom:1px solid #ccc' : '';
      const titleCell = `<span>${name}</span>${notePart}${descBlock}`;
      return `<tr style="${border}"><td style="padding:2px 4px;vertical-align:top">${titleCell}</td><td style="padding:2px 4px;white-space:nowrap;vertical-align:top">${item.quantity} ×</td>${price}</tr>`;
    }).join('');
    return `<div style="${style}"><table style="width:100%;text-align:right;border-collapse:collapse"><tbody>${rows}</tbody></table></div>`;
  }

  if (module.type === 'totals') {
    const showPrice = opt.showPrice !== false;
    if (!showPrice) return `<div style="${style}"></div>`;
    const total = orderData?.totalAmount ?? 0;
    const discount = orderData?.discountAmount ?? 0;
    const final = orderData?.finalAmount ?? total - discount;
    let html = `<div style="${style}"><div style="display:flex;justify-content:space-between;padding:2px 0">جمع: ${formatPrice(total)}</div>`;
    if (discount > 0) html += `<div style="display:flex;justify-content:space-between;padding:2px 0">تخفیف: -${formatPrice(discount)}</div>`;
    html += `<div style="display:flex;justify-content:space-between;padding:4px 0;font-weight:bold;border-top:2px solid #000;margin-top:4px">مبلغ نهایی: ${formatPrice(final)}</div></div>`;
    return html;
  }

  if (module.type === 'image' && (opt.imageUrl || orderData?.logoUrl)) {
    const url = (opt.imageUrl as string) || orderData?.logoUrl;
    const w = (opt.widthMm as number) ?? 40;
    const h = (opt.heightMm as number) ?? 25;
    return `<div style="${style};display:flex;justify-content:center"><img src="${url}" alt="" style="max-width:${w}mm;max-height:${h}mm;object-fit:contain"/></div>`;
  }

  if (module.type === 'custom_text') {
    return `<div style="${style}">${(opt.customText as string) || 'متن دلخواه'}</div>`;
  }

  if (typeof value === 'string' && value) return `<div style="${style}">${value}</div>`;
  if (typeof value === 'number') return `<div style="${style}">${value}</div>`;
  return '';
}

export function generateReceiptHTMLFromLayout(
  orderData: any,
  layout: ReceiptLayoutV2,
  options: ReceiptTemplateOptions = {}
): string {
  const paperWidth = typeof options.paperWidth === 'number' ? options.paperWidth : 80;
  const margin = typeof options.margin === 'number' ? Math.max(0, options.margin) : 5;
  const printableWidth = typeof options.contentWidthMm === 'number' ? options.contentWidthMm : Math.max(30, paperWidth - margin * 2);
  const shiftLeftMm = typeof options.shiftLeftMm === 'number' ? options.shiftLeftMm : 0;
  const contentPadding = 2;

  const receiptNumber = typeof options.receiptNumber === 'number' ? options.receiptNumber : 0;
  if (orderData && orderData.receiptCallNumber == null && receiptNumber > 0) {
    orderData = { ...orderData, receiptCallNumber: receiptNumber };
  }

  const rows = (layout.rows || []).slice().sort((a, b) => a.order - b.order);
  const parts: string[] = [];
  for (const row of rows) {
    if (row.type === 'single') {
      const blocks = Array.isArray(row.blocks) && !Array.isArray(row.blocks[0]) ? (row.blocks as ReceiptLayoutModule[]) : [];
      for (const m of blocks) {
        const html = renderLayoutModuleHtml(m, orderData);
        if (html) parts.push(html);
      }
    } else if (row.type === 'columns' && Array.isArray(row.blocks)) {
      const cols = row.blocks as ReceiptLayoutModule[][];
      const gridCols = row.columnWidths?.length
        ? row.columnWidths.map((w) => w + 'fr').join(' ')
        : 'repeat(' + (row.columnCount || cols.length) + ',1fr)';
      parts.push('<div style="display:grid;grid-template-columns:' + gridCols + ';gap:6px;margin-bottom:4px">');
      for (const col of cols) {
        parts.push('<div>');
        for (const m of col) {
          const html = renderLayoutModuleHtml(m, orderData);
          if (html) parts.push(html);
        }
        parts.push('</div>');
      }
      parts.push('</div>');
    }
  }

  const bodyContent = parts.join('');
  return `<!DOCTYPE html>
<html dir="rtl" lang="fa">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>رسید سفارش</title>
  <style>
    :root { --paper-width: ${paperWidth}mm; --printable-width: ${printableWidth}mm; --content-padding: ${contentPadding}mm; --shift-left: ${shiftLeftMm}mm; }
    @page { size: var(--paper-width) auto; margin: 0; }
    html, body { width: var(--paper-width); max-width: var(--paper-width); margin: 0; padding: 0; margin-right: var(--shift-left); font-family: Tahoma, Arial, sans-serif; box-sizing: border-box; direction: rtl; text-align: right; word-break: break-word; background: #fff; }
    .receipt-root { width: var(--printable-width); max-width: var(--printable-width); padding: var(--content-padding); box-sizing: border-box; background: #fff; margin: 0; }
    * { box-sizing: border-box; max-width: 100%; }
  </style>
</head>
<body>
  <div class="receipt-root">${bodyContent}</div>
</body>
</html>`;
}

export function generateKitchenReceiptHTML(orderData: any, options: ReceiptTemplateOptions = {}): string {
  const items = orderData.items || [];
  const orderNumber = orderData.orderNumber || orderData.order_number || orderData.id || 'N/A';
  const serviceType = orderData.serviceType === 'dine_in' ? 'داخل سالن' : 'بیرون‌بر';
  const tableNumber = orderData.tableNumber || '';
  const customerAddress = orderData.customerAddress || '';
  const notes = orderData.notes || '';
  const date = new Date().toLocaleString('fa-IR');

  const paperWidth = typeof options.paperWidth === 'number' ? options.paperWidth : 80;
  const printerMargin = typeof options.margin === 'number' ? Math.max(0, options.margin) : 5;
  const printableWidth = typeof options.contentWidthMm === 'number'
    ? options.contentWidthMm
    : Math.max(30, paperWidth - printerMargin * 2);
  const shiftLeftMm = typeof options.shiftLeftMm === 'number' ? options.shiftLeftMm : 0;
  const contentPadding = 2;
  const receiptNumber = typeof options.receiptNumber === 'number' ? options.receiptNumber : 0;

  return `
<!DOCTYPE html>
<html dir="rtl" lang="fa">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>رسید آشپزخانه</title>
  <style>
    :root {
      --paper-width: ${paperWidth}mm;
      --printable-width: ${printableWidth}mm;
      --content-padding: ${contentPadding}mm;
      --shift-left: ${shiftLeftMm}mm;
    }
    @page {
      size: var(--paper-width) auto;
      margin: 0;
    }
    html, body {
      width: var(--paper-width);
      max-width: var(--paper-width);
      margin: 0;
      padding: 0;
      padding-top: 0 !important;
      margin-right: var(--shift-left);
    }
    body {
      font-family: 'Tahoma', 'Arial', sans-serif;
      font-size: 14px;
      box-sizing: border-box;
      direction: rtl;
      text-align: right;
      overflow-wrap: break-word;
      word-break: break-word;
      background: #fff;
      display: flex;
      justify-content: flex-start;
    }
    .receipt-root {
      width: var(--printable-width);
      max-width: var(--printable-width);
      padding: var(--content-padding);
      padding-top: 0;
      box-sizing: border-box;
      background: #fff;
      margin: 0;
    }
    * {
      box-sizing: border-box;
      max-width: 100%;
    }
    .header,
    .order-info,
    .items,
    .footer {
      width: 100%;
    }
    .header {
      text-align: center;
      border-bottom: 3px solid #000;
      padding-top: 0 !important;
      padding-bottom: 6px;
      margin-top: 0 !important;
      margin-bottom: 6px;
    }
    .header h1 {
      margin: 0;
      font-size: 20px;
      font-weight: bold;
    }
    .order-number {
      font-size: 18px;
      font-weight: bold;
      margin: 8px 0;
    }
    .order-number-label {
      display: block;
      font-size: 11px;
      color: #333;
      margin-bottom: 2px;
    }
    .order-info {
      margin: 12px 0;
      font-size: 13px;
    }
    .order-info div {
      margin: 6px 0;
    }
    .items {
      margin: 15px 0;
      border-top: 2px solid #000;
      border-bottom: 2px solid #000;
      padding: 12px 0;
    }
    .item {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      margin: 10px 0;
      padding: 6px 0;
      width: 100%;
      font-size: 14px;
    }
    .item-name-col {
      flex: 1;
      min-width: 0;
      font-weight: 500;
    }
    .item-description {
      font-size: 11px;
      color: #444;
      font-weight: normal;
      margin-top: 4px;
      line-height: 1.35;
    }
    .item-line-note {
      font-size: 11px;
      color: #333;
      font-weight: normal;
      margin-top: 4px;
      line-height: 1.3;
    }
    .item-quantity {
      margin: 0 8px;
      white-space: nowrap;
      font-weight: bold;
      font-size: 16px;
    }
    .item-price, .totals, .total-row { display: none !important; }
    .footer {
      text-align: center;
      margin-top: 20px;
      padding-top: 12px;
      border-top: 2px dashed #000;
      font-size: 11px;
    }
    .notes {
      margin-top: 12px;
      padding: 8px;
      background: #f5f5f5;
      border-radius: 4px;
      font-size: 12px;
    }
    .receipt-number-box {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 22mm;
      height: 22mm;
      min-width: 22mm;
      min-height: 22mm;
      margin: 8px auto;
      border: 3px solid #000;
      font-size: 28px;
      font-weight: bold;
      line-height: 1;
    }
  </style>
</head>
<body>
  <div class="receipt-root">
    <div class="header">
      <h1>رسید آشپزخانه</h1>
      ${receiptNumber > 0 ? `<div class="receipt-number-box">${receiptNumber}</div>` : ''}
      <div class="order-number">
        <span class="order-number-label">شماره سفارش</span>
        #${orderNumber}
      </div>
      <div>${date}</div>
    </div>

    <div class="order-info">
      <div><strong>نوع سفارش:</strong> ${serviceType}</div>
      ${tableNumber ? `<div><strong>میز:</strong> ${tableNumber}</div>` : ''}
      ${customerAddress ? `<div><strong>آدرس:</strong> ${customerAddress}</div>` : ''}
    </div>

    <div class="items">
      ${items.map((item: any) => {
        const title = item.product?.name_fa || item.productName || 'محصول';
        const desc = getProductDescription(item);
        const lineNote = getLineItemNote(item);
        return `
        <div class="item">
          <div class="item-name-col">
            <span class="item-name">${title}</span>
            ${desc ? `<div class="item-description">${desc}</div>` : ''}
            ${lineNote ? `<div class="item-line-note">یادداشت خط: ${lineNote}</div>` : ''}
          </div>
          <span class="item-quantity">${item.quantity} ×</span>
        </div>
      `;
      }).join('')}
    </div>

    ${notes ? `
    <div class="notes">
      <strong>یادداشت:</strong> ${notes}
    </div>
    ` : ''}

    <div class="footer">
      <div>${date}</div>
    </div>
  </div>
</body>
</html>
  `;
}

