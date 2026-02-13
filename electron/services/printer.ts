import { BrowserWindow } from 'electron';
import { getNextReceiptNumber, setReceiptNumbersForOrder } from '../database/preferences';

export type ReceiptType = 'full' | 'kitchen';

export interface PrinterJob {
  name: string;
  displayName?: string;
  paperWidth?: number; // mm
  paperLength?: number; // mm
  margin?: number; // mm
  receiptType?: ReceiptType;
  copies?: number;
}

interface ReceiptTemplateOptions {
  paperWidth?: number;
  margin?: number;
  receiptNumber?: number;
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
    const paperWidth = defaultConfig?.paperWidth ?? 80;
    const margin = defaultConfig?.margin ?? 5;

    // چاپ هر نوع رسید برای این پرینتر
    for (const job of jobs) {
      try {
        const receiptType = job.receiptType || 'full';
        const receiptHTML = receiptType === 'kitchen' 
          ? generateKitchenReceiptHTML(orderData, { paperWidth, margin, receiptNumber })
          : generateReceiptHTML(orderData, { paperWidth, margin, receiptNumber });

        await printWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(receiptHTML)}`);
        await new Promise(resolve => setTimeout(resolve, 1000));

        const width = mmToMicrons(paperWidth);
        const height = mmToMicrons(job.paperLength ?? 200);
        const copies = Math.max(1, Math.floor(job.copies ?? 1));
        const cssWidthValue = paperWidth.toFixed(2);
        const cssPaddingValue = Math.max(1, margin).toFixed(2);

        try {
          await printWindow.webContents.executeJavaScript(`
            document.documentElement.style.setProperty('--paper-width', '${cssWidthValue}mm');
            document.documentElement.style.setProperty('--printer-margin', '${cssPaddingValue}mm');
            document.documentElement.style.setProperty('--content-padding', '${Math.max(2, Math.min(6, margin)).toFixed(2)}mm');
          `);
        } catch (styleError) {
          console.warn('Failed to apply dynamic paper style variables:', styleError);
        }

        // چاپ به تعداد copies
        for (let i = 0; i < copies; i++) {
          await new Promise<void>((resolve, reject) => {
            printWindow.webContents.print(
              {
                silent: true,
                printBackground: true,
                deviceName: printerName,
                copies: 1, // چاپ یک به یک
                margins: {
                  marginType: 'custom',
                  top: margin,
                  bottom: margin,
                  left: margin,
                  right: margin,
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
  const serviceType = orderData.serviceType === 'dine_in' ? 'داخل سالن' : 'بیرون‌بر';
  const tableNumber = orderData.tableNumber || '';
  const customerAddress = orderData.customerAddress || '';
  const paymentMethod = getPaymentMethodText(orderData.paymentMethod);
  const notes = orderData.notes || '';
  const date = new Date().toLocaleString('fa-IR');

  const paperWidth = typeof options.paperWidth === 'number' ? options.paperWidth : 80;
  const printerMargin = typeof options.margin === 'number' ? Math.max(0, options.margin) : 5;
  const printableWidth = Math.max(30, paperWidth - printerMargin * 2);
  const contentPadding = Math.max(2, Math.min(6, printerMargin || 4));
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
      --printer-margin: ${printerMargin}mm;
      --print-safe-gap: 2mm;
    }
    @page {
      size: var(--paper-width) auto;
      margin: 0;
    }
    html, body {
  width: var(--printable-width);
  margin: 0;
  padding: 0;
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
      justify-content: center;
    }
    .receipt-root {
      width: calc(var(--printable-width) - var(--print-safe-gap));
      max-width: calc(var(--printable-width) - var(--print-safe-gap));
      padding: var(--content-padding);
      box-sizing: border-box;
      background: #fff;
      margin: 0 auto;
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
      padding-bottom: 10px;
      margin-bottom: 10px;
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
    .item-name {
      flex: 1;
      padding-left: 4px;
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
      <h1>رسید سفارش</h1>
      <div class="receipt-fish-row">
        <span class="receipt-fish-label">شماره فیش (فراخوانی)</span>
        <div class="receipt-number-box">${receiptNumber > 0 ? receiptNumber : '—'}</div>
      </div>
      <div class="order-number-row">
        <span class="order-number-label">شماره سفارش</span>
        <span class="order-number-value">#${orderNumber}</span>
      </div>
      <div>${date}</div>
    </div>

    <div class="order-info">
      <div><strong>مشتری:</strong> ${customerName}</div>
      <div><strong>نوع سفارش:</strong> ${serviceType}</div>
      ${tableNumber ? `<div><strong>میز:</strong> ${tableNumber}</div>` : ''}
      ${customerAddress ? `<div><strong>آدرس:</strong> ${customerAddress}</div>` : ''}
      <div><strong>روش پرداخت:</strong> ${paymentMethod}</div>
      ${notes ? `<div><strong>یادداشت:</strong> ${notes}</div>` : ''}
    </div>

    <div class="items">
      ${items.map((item: any) => `
        <div class="item">
          <span class="item-name">${item.product?.name_fa || item.productName || 'محصول'}</span>
          <span class="item-quantity">${item.quantity} ×</span>
          <span class="item-price">${formatPrice(item.price)}</span>
        </div>
      `).join('')}
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
  const html = generateReceiptHTML(orderData, options);
  const paperWidth = typeof options.paperWidth === 'number' ? options.paperWidth : 80;
  const widthPx = Math.max(320, Math.round((paperWidth / 25.4) * 96));
  const previewWindow = new BrowserWindow({
    show: false,
    width: widthPx,
    height: 900,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      offscreen: true,
    },
  });

  await previewWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
  await new Promise((resolve) => setTimeout(resolve, 500));

  let imageDataUrl: string | undefined;
  try {
    const image = await previewWindow.webContents.capturePage();
    imageDataUrl = image?.toDataURL();
  } catch (error) {
    console.warn('Failed to capture preview image:', error);
  } finally {
    previewWindow.destroy();
  }

  return { html, imageDataUrl };
}

function formatPrice(price: number): string {
  return new Intl.NumberFormat('fa-IR').format(price) + ' تومان';
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
  const printableWidth = Math.max(30, paperWidth - printerMargin * 2);
  const contentPadding = Math.max(2, Math.min(6, printerMargin || 4));
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
      --printer-margin: ${printerMargin}mm;
      --print-safe-gap: 2mm;
    }
    @page {
      size: var(--paper-width) auto;
      margin: 0;
    }
    html, body {
      width: var(--printable-width);
      margin: 0;
      padding: 0;
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
      justify-content: center;
    }
    .receipt-root {
      width: calc(var(--printable-width) - var(--print-safe-gap));
      max-width: calc(var(--printable-width) - var(--print-safe-gap));
      padding: var(--content-padding);
      box-sizing: border-box;
      background: #fff;
      margin: 0 auto;
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
      padding-bottom: 12px;
      margin-bottom: 12px;
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
    .item-name {
      flex: 1;
      font-weight: 500;
    }
    .item-quantity {
      margin: 0 8px;
      white-space: nowrap;
      font-weight: bold;
      font-size: 16px;
    }
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
      ${items.map((item: any) => `
        <div class="item">
          <span class="item-name">${item.product?.name_fa || item.productName || 'محصول'}</span>
          <span class="item-quantity">${item.quantity} ×</span>
        </div>
      `).join('')}
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

