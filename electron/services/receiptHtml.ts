import * as path from 'path';
import * as fs from 'fs';
import { type ReceiptPriceDisplayUnit } from '../database/preferences';
import { ReceiptTemplateOptions } from './printTypes';
import { getLineItemNote, getProductDescription, getPaymentMethodText } from './receiptLayoutHtml';

/** معرفی نرم‌افزار که باید زیر همهٔ رسیدها (هر قالبی) چاپ شود */
export const BRAND_FOOTER_TEXT = 'با تشکر از انتخاب شما نرم افزار سکه secoin.ir';

/**
 * فوتر برند + تاریخ؛ در همهٔ قالب‌ها (پیش‌فرض، آشپزخانه و قالب‌های سرور) یکسان است.
 * اگر قالب خودش بلوک «تشکر» داشته باشد، فقط نام نرم‌افزار چاپ می‌شود تا تکراری نشود.
 */
export function renderBrandFooterHtml(
  date: string,
  options: { thanksAlreadyShown?: boolean } = {},
): string {
  const text = options.thanksAlreadyShown ? 'نرم افزار سکه secoin.ir' : BRAND_FOOTER_TEXT;
  return `<div class="brand-footer"><div>${text}</div><div style="margin-top:4px">${date}</div></div>`;
}

export const BRAND_FOOTER_CSS =
  '.brand-footer { text-align: center; margin-top: 12px; font-size: 8pt; font-weight: bold; }';

export function getPriceUnitLabel(unit: ReceiptPriceDisplayUnit): string {
  return unit === 'toman' ? 'تومان' : 'ریال';
}

/**
 * فقط عدد، با ارقام لاتین (خواناتر روی چاپگر حرارتی) و بدون واحد پولی.
 * مبالغ سفارش (item.price/totalAmount/...) همیشه به ریال ذخیره می‌شوند (همان‌طور که Menus_BE
 * ذخیره می‌کند) — پس بدون تبدیل همان عدد ریالی هستند؛ فقط برای نمایش «تومان» به ۱۰ تقسیم می‌شوند.
 */
export function createFormatPriceValue(
  unit: ReceiptPriceDisplayUnit = 'rial',
): (price: number) => string {
  return (price: number) => {
    const n = Number(price) || 0;
    const value = unit === 'toman' ? Math.round(n / 10) : n;
    return new Intl.NumberFormat('en-US').format(value);
  };
}

export function createFormatPrice(
  unit: ReceiptPriceDisplayUnit = 'rial',
): (price: number) => string {
  const formatValue = createFormatPriceValue(unit);
  const label = getPriceUnitLabel(unit);
  return (price: number) => `${formatValue(price)} ${label}`;
}

/** خانوادهٔ فونتی که در رسید استفاده می‌شود — دقیقاً همان ایران‌یکانِ استفاده‌شده در رندرر (src/index.css) */
export const RECEIPT_FONT_FAMILY = "'iranyekan', Tahoma, Arial, sans-serif";

let cachedIranYekanFontFaceCss: string | null = null;

/**
 * فونت ایران‌یکان را به‌صورت data URI درون CSS جاسازی می‌کند تا در پنجرهٔ چاپ (که با data: URL
 * بارگذاری می‌شود و مسیر نسبی برای فایل فونت ندارد) قابل استفاده باشد. اگر فایل فونت پیدا نشود
 * (مثلاً یک بیلد ناقص)، رشتهٔ خالی برمی‌گردد و چاپ با فونت‌های سیستم (fallback در RECEIPT_FONT_FAMILY) ادامه می‌یابد.
 */
export function getIranYekanFontFaceCss(): string {
  if (cachedIranYekanFontFaceCss !== null) return cachedIranYekanFontFaceCss;
  try {
    const fontsDir = path.join(__dirname, '..', '..', 'dist-react', 'fonts');
    const toDataUri = (file: string) =>
      `data:font/woff;base64,${fs.readFileSync(path.join(fontsDir, file)).toString('base64')}`;
    cachedIranYekanFontFaceCss = `
    @font-face { font-family: 'iranyekan'; font-style: normal; font-weight: normal; src: url('${toDataUri('iranyekanwebregularfanum.woff')}') format('woff'); }
    @font-face { font-family: 'iranyekan'; font-style: normal; font-weight: bold; src: url('${toDataUri('iranyekanwebboldfanum.woff')}') format('woff'); }`;
  } catch {
    cachedIranYekanFontFaceCss = '';
  }
  return cachedIranYekanFontFaceCss;
}

export function generateReceiptHTML(orderData: any, options: ReceiptTemplateOptions = {}): string {
  const formatPrice = createFormatPrice(options.priceDisplayUnit ?? 'rial');
  const items = orderData.items || [];
  const totalAmount = orderData.totalAmount || 0;
  const discountAmount = orderData.discountAmount || 0;
  const vatAmount = orderData.vatAmount || 0;
  const finalAmount = orderData.finalAmount || totalAmount - discountAmount + vatAmount;
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
  const printableWidth =
    typeof options.contentWidthMm === 'number'
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
    ${getIranYekanFontFaceCss()}
    :root {
      --paper-width: ${paperWidth}mm;
      --printable-width: ${printableWidth}mm;
      --content-padding: ${contentPadding}mm;
      --shift-left: ${shiftLeftMm}mm;
    }
    @page { size: var(--paper-width) auto; margin: 0; }
    html, body {
      width: var(--paper-width);
      max-width: var(--paper-width);
      margin: 0; padding: 0; padding-top: 0 !important;
      margin-right: var(--shift-left);
    }
    body {
      font-family: ${RECEIPT_FONT_FAMILY};
      font-size: 10pt;
      color: #000 !important;
      -webkit-font-smoothing: none;
      text-rendering: geometricPrecision;
      box-sizing: border-box; direction: rtl; text-align: right;
      overflow-wrap: break-word; word-break: break-word;
      background: #fff;
    }
    .receipt-root {
      width: var(--printable-width); max-width: var(--printable-width);
      padding: var(--content-padding); padding-top: 0;
      box-sizing: border-box; background: #fff; margin: 0;
    }
    * { box-sizing: border-box; max-width: 100%; color: #000 !important; }
    
    .divider { border-bottom: 2px dashed #000; margin: 8px 0; }
    .divider-solid { border-bottom: 2px solid #000; margin: 8px 0; }

    .header { text-align: center; padding-bottom: 4px; }
    
    .receipt-fish-row { text-align: center; margin: 8px 0; }
    .receipt-number-box {
      display: inline-flex; align-items: center; justify-content: center;
      width: 22mm; height: 22mm; margin: 0 auto;
      border: 3px solid #000;
      font-size: 24pt; font-weight: bold; line-height: 1;
    }
    .receipt-restaurant-name {
      text-align: center; margin-top: 6px; font-size: 11pt; font-weight: bold;
    }

    .order-info { margin: 8px 0; font-size: 9pt; }
    .order-info div { margin: 4px 0; display: flex; justify-content: space-between; }
    .order-info strong { font-weight: bold; }

    .items-table { width: 100%; border-collapse: collapse; margin: 10px 0; font-size: 9pt; }
    .items-table th { border-bottom: 1px solid #000; padding-bottom: 4px; text-align: right; font-weight: bold; }
    .items-table td { padding: 6px 0; vertical-align: top; border-bottom: 1px dashed #000; }
    .items-table tr:last-child td { border-bottom: none; }
    
    .item-name { font-weight: bold; font-size: 10pt; display: block; }
    .item-details { font-size: 8pt; margin-top: 3px; line-height: 1.4; white-space: pre-wrap; }
    
    .col-qty { text-align: center; width: 15%; font-weight: bold; font-size: 11pt; white-space: nowrap; }
    .col-price { text-align: center; width: 30%; font-weight: bold; white-space: nowrap; }

    .totals { margin: 10px 0; font-size: 10pt; }
    .total-row { display: flex; justify-content: space-between; margin: 6px 0; }
    .total-row.final { font-size: 13pt; font-weight: bold; margin-top: 8px; padding-top: 8px; border-top: 2px solid #000; }

    /* --- تغییرات اصلی اینجاست --- */
    .notes-box {
      border: 1px solid #000; 
      padding: 6px; 
      margin: 10px 0;
      font-size: 9pt; 
      font-weight: bold; 
      border-radius: 4px;
      white-space: pre-wrap; /* اعمال اینترها و رفتن تا انتهای خط */
      word-break: normal; /* جلوگیری از رفتار عجیب روی اعداد */
      line-height: 1.6;
      text-align: justify; /* پر کردن کامل عرض */
      text-align-last: right; /* خط آخر راست‌چین بماند */
    }

    ${BRAND_FOOTER_CSS}
    .brand-footer { margin-top: 15px; }
  </style>
</head>
<body>
  <div class="receipt-root">
    <div class="header">
      <div class="receipt-fish-row">
        <div class="receipt-number-box">${receiptNumber > 0 ? receiptNumber : '—'}</div>
        <div class="receipt-restaurant-name">${restaurantName || 'رستوران'}</div>
      </div>
    </div>
    
    <div class="divider"></div>

    <div class="order-info">
      <div><span>مشتری:</span> <strong>${customerName}</strong></div>
      <div><span>سفارش:</span> <strong>${serviceType}</strong></div>
      ${tableNumber ? `<div><span>میز:</span> <strong>${tableNumber}</strong></div>` : ''}
      ${customerAddress ? `<div style="display:block"><span>آدرس:</span> <strong>${customerAddress}</strong></div>` : ''}
    </div>

    ${notes ? `<div class="notes-box">یادداشت: ${notes}</div>` : ''}

    <div class="divider-solid"></div>

    <table class="items-table">
      <thead>
        <tr>
          <th>شرح سفارش</th>
          <th class="col-qty">تعداد</th>
          <th class="col-price">مبلغ</th>
        </tr>
      </thead>
      <tbody>
      ${items
        .map((item: any) => {
          const title = item.product?.name_fa || item.productName || 'محصول';
          const desc = getProductDescription(item);
          const lineNote = getLineItemNote(item);
          return `
        <tr>
          <td>
            <span class="item-name">${title}</span>
            ${lineNote ? `<div class="item-details">${lineNote}</div>` : desc ? `<div class="item-details">${desc}</div>` : ''}
          </td>
          <td class="col-qty">${item.quantity}${item.product?.unit && item.product.unit !== 'عدد' ? ` ${item.product.unit}` : ''}</td>
          <td class="col-price">${formatPrice(+item.price * +item.quantity)}</td>
        </tr>`;
        })
        .join('')}
      </tbody>
    </table>

    <div class="divider-solid"></div>

    <div class="totals">
      <div class="total-row">
        <span>جمع کل:</span>
        <span>${formatPrice(totalAmount)}</span>
      </div>
      ${
        discountAmount > 0
          ? `
      <div class="total-row">
        <span>تخفیف:</span>
        <span>-${formatPrice(discountAmount)}</span>
      </div>
      `
          : ''
      }
      ${
        vatAmount > 0
          ? `
      <div class="total-row">
        <span>ارزش افزوده:</span>
        <span>+${formatPrice(vatAmount)}</span>
      </div>
      `
          : ''
      }
      <div class="total-row final">
        <span>مبلغ نهایی:</span>
        <span>${formatPrice(finalAmount)}</span>
      </div>
    </div>

    <div class="divider"></div>

    ${renderBrandFooterHtml(date)}
  </div>
</body>
</html>
  `;
}
