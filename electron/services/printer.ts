import { BrowserWindow } from 'electron';

export interface PrinterJob {
  name: string;
  displayName?: string;
  paperWidth?: number; // mm
  paperLength?: number; // mm
  margin?: number; // mm
  copies?: number;
}

interface ReceiptTemplateOptions {
  paperWidth?: number;
  margin?: number;
}

const mmToMicrons = (value: number) => Math.max(1, Math.round(value * 1000));

export async function printReceipt(orderData: any, printerJobs: PrinterJob[]): Promise<void> {
  if (!printerJobs || printerJobs.length === 0) {
    throw new Error('No printers selected');
  }

  const printWindow = new BrowserWindow({
    show: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  const defaultConfig = printerJobs[0];
  const receiptHTML = generateReceiptHTML(orderData, {
    paperWidth: defaultConfig?.paperWidth,
    margin: defaultConfig?.margin,
  });
  await printWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(receiptHTML)}`);

  await new Promise(resolve => setTimeout(resolve, 1000));

  for (const job of printerJobs) {
    try {
      const width = mmToMicrons(job.paperWidth ?? 80);
      const height = mmToMicrons(job.paperLength ?? 200);
      const margin = job.margin ?? 5;
      const copies = job.copies && job.copies > 0 ? Math.floor(job.copies) : 1;
      const cssWidthValue = (job.paperWidth ?? 80).toFixed(2);
      const cssPaddingValue = Math.max(1, job.margin ?? 5).toFixed(2);

      try {
        await printWindow.webContents.executeJavaScript(`
          document.documentElement.style.setProperty('--paper-width', '${cssWidthValue}mm');
          document.documentElement.style.setProperty('--printer-margin', '${cssPaddingValue}mm');
          document.documentElement.style.setProperty('--content-padding', '${Math.max(2, Math.min(6, job.margin ?? 4)).toFixed(2)}mm');
        `);
      } catch (styleError) {
        console.warn('Failed to apply dynamic paper style variables:', styleError);
      }

      await new Promise<void>((resolve, reject) => {
        printWindow.webContents.print(
          {
            silent: true,
            printBackground: true,
            deviceName: job.name,
            copies,
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
              reject(new Error(`Failed to print to ${job.name}: ${failureReason}`));
            }
          }
        );
      });
      await new Promise((resolve) => setTimeout(resolve, 500));
    } catch (error) {
      console.error(`Error printing to ${job.name}:`, error);
    }
  }

  printWindow.close();
}

export function generateReceiptHTML(orderData: any, options: ReceiptTemplateOptions = {}): string {
  const items = orderData.items || [];
  const totalAmount = orderData.totalAmount || 0;
  const discountAmount = orderData.discountAmount || 0;
  const finalAmount = orderData.finalAmount || totalAmount - discountAmount;
  const orderNumber = orderData.orderNumber || orderData.id || 'N/A';
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
  </style>
</head>
<body>
  <div class="receipt-root">
    <div class="header">
      <h1>رسید سفارش</h1>
      <div>شماره سفارش: #${orderNumber}</div>
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
  const previewWindow = new BrowserWindow({
    show: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      offscreen: true,
    },
  });

  await previewWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
  await new Promise((resolve) => setTimeout(resolve, 400));

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

