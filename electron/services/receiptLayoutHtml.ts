import { ReceiptLayoutV2, ReceiptLayoutModule, ReceiptTemplateOptions } from './printTypes';
import { logPrintDebug, collectImageUrlsFromLayout, resolveImageForPrint } from './receiptImages';
import {
  renderBrandFooterHtml,
  BRAND_FOOTER_CSS,
  getPriceUnitLabel,
  createFormatPriceValue,
  createFormatPrice,
  RECEIPT_FONT_FAMILY,
  getIranYekanFontFaceCss,
} from './receiptHtml';

/** یادداشت خط سفارش — در اسنپ‌شات الکترون `itemOption` است، از API معمولاً `itemNote` */
export function getLineItemNote(item: any): string {
  const n = item?.itemNote ?? item?.itemOption;
  return n != null ? String(n).trim() : '';
}

/** توضیحات ثبت‌شده در کارت محصول (منو) */
export function getProductDescription(item: any): string {
  const d = item?.product?.description;
  return d != null ? String(d).trim() : '';
}

export function getPaymentMethodText(method: string): string {
  const methods: { [key: string]: string } = {
    cash: 'نقد',
    card: 'کارت',
    online: 'آنلاین',
    mixed: 'ترکیبی',
  };
  return methods[method] || method;
}

export function getValueForLayoutModule(
  type: string,
  orderData: any,
  module?: ReceiptLayoutModule,
): { value: string | number; isEmpty: boolean } {
  switch (type) {
    case 'call_number': {
      const callNumber = Number(orderData?.receiptCallNumber ?? 0);
      // شمارهٔ صفر یعنی شماره‌ای وجود ندارد؛ نباید کادر خالیِ بزرگ چاپ شود
      return { value: callNumber > 0 ? callNumber : '', isEmpty: !(callNumber > 0) };
    }
    case 'restaurant_name':
      return { value: orderData?.restaurantName ?? '', isEmpty: !orderData?.restaurantName };
    case 'order_number':
      return {
        value: orderData?.orderNumber ?? orderData?.id ?? '—',
        isEmpty: !orderData?.orderNumber && orderData?.id == null,
      };
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
      if (orderData?.paymentMethod)
        parts.push(`پرداخت: ${getPaymentMethodText(orderData.paymentMethod)}`);
      return { value: parts.join(' | '), isEmpty: false };
    }
    case 'items':
      return { value: '', isEmpty: !orderData?.items?.length };
    case 'totals':
      return { value: '', isEmpty: false };
    case 'footer':
      return { value: 'با تشکر از انتخاب شما', isEmpty: false };
    case 'custom_text':
      return {
        value: (module?.options?.customText as string) ?? '',
        isEmpty: !module?.options?.customText,
      };
    case 'divider':
      return { value: '—', isEmpty: false };
    case 'image':
      return { value: orderData?.logoUrl ?? '', isEmpty: !orderData?.logoUrl };
    default:
      return { value: '', isEmpty: false };
  }
}

export function renderLayoutModuleHtml(
  module: ReceiptLayoutModule,
  orderData: any,
  formatPrice: (price: number) => string,
  formatPriceValue: (price: number) => string,
  priceUnitLabel: string,
  resolvedImages?: Map<string, string>,
): string {
  const opt = module.options || {};
  const hideWhenEmpty = opt.hideWhenEmpty === true;
  const { value, isEmpty: isEmptyRaw } = getValueForLayoutModule(module.type, orderData, module);
  // نکتهٔ حیاتی: getValueForLayoutModule برای نوع 'image' فقط orderData.logoUrl (که هیچ‌وقت
  // در هیچ سفارشی پر نمی‌شود) را بررسی می‌کند، نه opt.imageUrl واقعیِ ماژول — پس بدون این
  // استثنا، ماژول تصویر با تنظیم پیش‌فرضِ hideWhenEmpty=true همیشه «خالی» تشخیص داده می‌شد
  // و اینجا، پیش از رسیدن به رندر واقعی عکس، بی‌صدا حذف می‌شد (صرف‌نظر از درست بودن URL).
  const isEmpty = module.type === 'image' ? !(opt.imageUrl || orderData?.logoUrl) : isEmptyRaw;
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
    // کادر شمارهٔ فراخوانی بدون شماره فقط یک مربع خالیِ بزرگ در بالای رسید است
    if (isEmpty) return '';
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

    if (tableStyle === 'full') {
      const cellBorder = '1px solid #999';
      const striped = opt.itemsStriped === true;
      const showTotalPrice = opt.showTotalPrice !== false;
      const headerCss = `border:${cellBorder};font-size:0.85em`;
      const rows = orderData.items
        .map((item: any, i: number) => {
          const name = item.product?.name_fa || item.productName || 'محصول';
          const desc = showDesc ? getProductDescription(item) : '';
          const lineNote = showLineNote ? getLineItemNote(item) : '';
          const notePart = lineNote ? ` (${lineNote})` : '';
          const descBlock = desc
            ? `<div style="font-size:0.85em;margin-top:2px;line-height:1.3">${desc}</div>`
            : '';
          const price = showPrice
            ? `<td style="padding:2px 4px;white-space:nowrap;vertical-align:top;border:${cellBorder}">${formatPriceValue(item.price)}</td>`
            : '';
          const total = showTotalPrice
            ? `<td style="padding:2px 4px;white-space:nowrap;vertical-align:top;font-weight:bold;border:${cellBorder}">${formatPriceValue(+item.price * +item.quantity)}</td>`
            : '';
          const rowBg = striped && i % 2 === 1 ? 'background:#f2f2f2' : '';
          const titleCell = `<span>${name}</span>${notePart}${descBlock}`;
          return `<tr style="${rowBg}"><td style="padding:2px 4px;vertical-align:top;border:${cellBorder};word-break:break-word;overflow-wrap:anywhere">${titleCell}</td><td style="padding:2px 4px;white-space:nowrap;vertical-align:top;text-align:center;border:${cellBorder}">${item.quantity}</td>${price}${total}</tr>`;
        })
        .join('');
      const showPriceUnit = opt.showPriceUnit !== false;
      const unitLabelHtml = showPriceUnit
        ? ` <span style="font-size:0.75em;font-weight:normal">(${priceUnitLabel})</span>`
        : '';
      const priceHeader = showPrice
        ? `<th style="padding:4px;white-space:nowrap;width:24%;${headerCss}">قیمت${unitLabelHtml}</th>`
        : '';
      const totalHeader = showTotalPrice
        ? `<th style="padding:4px;white-space:nowrap;width:24%;${headerCss}">قیمت کل${unitLabelHtml}</th>`
        : '';
      return `<div style="${style}"><table style="width:100%;text-align:right;border-collapse:collapse;border:${cellBorder};table-layout:fixed"><thead><tr style="background:#f2f2f2"><th style="padding:4px;${headerCss}">نام کالا</th><th style="padding:4px;white-space:nowrap;width:14%;${headerCss}">تعداد</th>${priceHeader}${totalHeader}</tr></thead><tbody>${rows}</tbody></table></div>`;
    }

    const rows = orderData.items
      .map((item: any) => {
        const name = item.product?.name_fa || item.productName || 'محصول';
        const desc = showDesc ? getProductDescription(item) : '';
        const lineNote = showLineNote ? getLineItemNote(item) : '';
        const notePart = lineNote ? ` (${lineNote})` : '';
        const descBlock = desc
          ? `<div style="font-size:9pt;margin-top:2px;line-height:1.3">${desc}</div>`
          : '';
        const price = showPrice
          ? `<td style="padding:2px 4px;vertical-align:top">${formatPrice(item.price)}</td>`
          : '';
        const border = tableStyle === 'bordered' ? 'border-bottom:1px solid #000' : '';
        const titleCell = `<span>${name}</span>${notePart}${descBlock}`;
        const unitStr =
          item.product?.unit && item.product.unit !== 'عدد' ? ` ${item.product.unit}` : '';
        return `<tr style="${border}"><td style="padding:2px 4px;vertical-align:top">${titleCell}</td><td style="padding:2px 4px;white-space:nowrap;vertical-align:top">${item.quantity}${unitStr} ×</td>${price}</tr>`;
      })
      .join('');
    return `<div style="${style}"><table style="width:100%;text-align:right;border-collapse:collapse"><tbody>${rows}</tbody></table></div>`;
  }

  if (module.type === 'totals') {
    const showPrice = opt.showPrice !== false;
    if (!showPrice) return `<div style="${style}"></div>`;
    const total = orderData?.totalAmount ?? 0;
    const discount = orderData?.discountAmount ?? 0;
    const vat = orderData?.vatAmount ?? 0;
    const final = orderData?.finalAmount ?? total - discount + vat;
    const totalsStyle = (opt.totalsStyle as string) ?? 'flex';
    const striped = opt.totalsStriped === true;
    const finalScale = opt.finalAmountScale ? Number(opt.finalAmountScale) / 100 : 1;
    const rowsData: { label: string; value: number; sign: '' | '-' | '+' }[] = [
      { label: 'جمع:', value: total, sign: '' },
      ...(discount > 0 ? [{ label: 'تخفیف:', value: discount, sign: '-' as const }] : []),
      ...(vat > 0 ? [{ label: 'ارزش افزوده:', value: vat, sign: '+' as const }] : []),
    ];

    if (totalsStyle === 'table') {
      const cellBorder = '1px solid #999';
      const bodyRows = rowsData
        .map((r, i) => {
          const rowBg = striped && i % 2 === 1 ? 'background:#f2f2f2' : '';
          return `<tr style="${rowBg}"><td style="padding:2px 4px;border:${cellBorder}">${r.label}</td><td style="padding:2px 4px;white-space:nowrap;border:${cellBorder}">${r.sign}${formatPriceValue(r.value)} <span style="font-size:0.75em;font-weight:normal">${priceUnitLabel}</span></td></tr>`;
        })
        .join('');
      const finalRow = `<tr style="font-weight:bold;font-size:${finalScale}em"><td style="padding:4px;border:${cellBorder}">مبلغ نهایی:</td><td style="padding:4px;white-space:nowrap;border:${cellBorder}">${formatPriceValue(final)}</td></tr>`;
      return `<div style="${style}"><table style="width:100%;text-align:right;border-collapse:collapse;border:${cellBorder}"><tbody>${bodyRows}${finalRow}</tbody></table></div>`;
    }

    let html =
      `<div style="${style}">` +
      rowsData
        .map(
          (r) =>
            `<div style="display:flex;justify-content:space-between;padding:2px 0">${r.label} ${r.sign}${formatPriceValue(r.value)} <span style="font-size:0.75em;font-weight:normal">${priceUnitLabel}</span></div>`,
        )
        .join('');
    html += `<div style="display:flex;justify-content:space-between;padding:4px 0;font-weight:bold;font-size:${finalScale}em;border-top:2px solid #000;margin-top:4px">مبلغ نهایی: ${formatPriceValue(final)}</div></div>`;
    return html;
  }

  if (module.type === 'image' && (opt.imageUrl || orderData?.logoUrl)) {
    const rawUrl = (opt.imageUrl as string) || orderData?.logoUrl;
    const url = resolvedImages?.get(rawUrl) ?? rawUrl;
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

export async function generateReceiptHTMLFromLayout(
  orderData: any,
  layout: ReceiptLayoutV2,
  options: ReceiptTemplateOptions = {},
): Promise<string> {
  const priceUnit = options.priceDisplayUnit ?? 'rial';
  const formatPrice = createFormatPrice(priceUnit);
  const formatPriceValue = createFormatPriceValue(priceUnit);
  const priceUnitLabel = getPriceUnitLabel(priceUnit);
  const paperWidth = typeof options.paperWidth === 'number' ? options.paperWidth : 80;
  const margin = typeof options.margin === 'number' ? Math.max(0, options.margin) : 5;
  const printableWidth =
    typeof options.contentWidthMm === 'number'
      ? options.contentWidthMm
      : Math.max(30, paperWidth - margin * 2);
  const shiftLeftMm = typeof options.shiftLeftMm === 'number' ? options.shiftLeftMm : 0;
  const contentPadding = 2;

  const receiptNumber = typeof options.receiptNumber === 'number' ? options.receiptNumber : 0;
  if (orderData && orderData.receiptCallNumber == null && receiptNumber > 0) {
    orderData = { ...orderData, receiptCallNumber: receiptNumber };
  }

  const imageUrls = collectImageUrlsFromLayout(layout);
  const allModules = (layout.rows || []).flatMap((row) =>
    row.type === 'single'
      ? Array.isArray(row.blocks) && !Array.isArray(row.blocks[0])
        ? (row.blocks as ReceiptLayoutModule[])
        : []
      : Array.isArray(row.blocks)
        ? (row.blocks as ReceiptLayoutModule[][]).flat()
        : [],
  );
  const imageModules = allModules.filter((m) => m?.type === 'image');
  if (imageModules.length === 0) {
    logPrintDebug(
      'generateReceiptHTMLFromLayout: no "image" module in this layout at all (template has no logo block, or a different template is active than expected)',
    );
  } else {
    for (const m of imageModules) {
      const rawUrl = m.options?.imageUrl;
      logPrintDebug(
        `generateReceiptHTMLFromLayout: found image module "${m.id}" visible=${m.visible} hideWhenEmpty=${m.options?.hideWhenEmpty} imageUrl=${rawUrl ? JSON.stringify(rawUrl) : '(empty)'}`,
      );
    }
  }
  const resolvedImages = new Map<string, string>();
  if (imageUrls.length > 0) {
    await Promise.all(
      imageUrls.map(async (url) => {
        resolvedImages.set(url, await resolveImageForPrint(url));
      }),
    );
  }

  const rows = (layout.rows || []).slice().sort((a, b) => a.order - b.order);
  const parts: string[] = [];
  for (const row of rows) {
    if (row.type === 'single') {
      const blocks =
        Array.isArray(row.blocks) && !Array.isArray(row.blocks[0])
          ? (row.blocks as ReceiptLayoutModule[])
          : [];
      for (const m of blocks) {
        const html = renderLayoutModuleHtml(
          m,
          orderData,
          formatPrice,
          formatPriceValue,
          priceUnitLabel,
          resolvedImages,
        );
        if (html) parts.push(html);
      }
    } else if (row.type === 'columns' && Array.isArray(row.blocks)) {
      const cols = row.blocks as ReceiptLayoutModule[][];
      const gridCols = row.columnWidths?.length
        ? row.columnWidths.map((w) => w + 'fr').join(' ')
        : 'repeat(' + (row.columnCount || cols.length) + ',1fr)';
      parts.push(
        '<div style="display:grid;grid-template-columns:' +
          gridCols +
          ';gap:6px;margin-bottom:4px">',
      );
      for (const col of cols) {
        parts.push('<div>');
        for (const m of col) {
          const html = renderLayoutModuleHtml(
            m,
            orderData,
            formatPrice,
            formatPriceValue,
            priceUnitLabel,
            resolvedImages,
          );
          if (html) parts.push(html);
        }
        parts.push('</div>');
      }
      parts.push('</div>');
    }
  }

  const hasFooterModule = rows.some((row) => {
    const blocks = Array.isArray(row.blocks) ? row.blocks.flat() : [];
    return (blocks as ReceiptLayoutModule[]).some((m) => m && m.type === 'footer' && m.visible);
  });
  const bodyContent =
    parts.join('') +
    renderBrandFooterHtml(new Date().toLocaleString('fa-IR'), {
      thanksAlreadyShown: hasFooterModule,
    });

  return `<!DOCTYPE html>
<html dir="rtl" lang="fa">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>رسید سفارش</title>
  <style>
    ${getIranYekanFontFaceCss()}
    :root { --paper-width: ${paperWidth}mm; --printable-width: ${printableWidth}mm; --content-padding: ${contentPadding}mm; --shift-left: ${shiftLeftMm}mm; }
    @page { size: var(--paper-width) auto; margin: 0; }
    html, body {
      width: var(--paper-width); max-width: var(--paper-width); margin: 0; padding: 0; padding-top: 0 !important;
      margin-right: var(--shift-left); font-family: ${RECEIPT_FONT_FAMILY}; box-sizing: border-box;
      direction: rtl; text-align: right; word-break: break-word; overflow-wrap: break-word; background: #fff;
      font-size: 10pt;
      color: #000 !important; /* حیاتی برای کیفیت چاپ */
      -webkit-font-smoothing: none; /* حیاتی برای کیفیت چاپ */
      text-rendering: geometricPrecision;
    }
    /* دقیقاً مثل قالب پیش‌فرض: بدون فاصلهٔ اضافه در بالای کاغذ */
    .receipt-root { width: var(--printable-width); max-width: var(--printable-width); padding: var(--content-padding); padding-top: 0; box-sizing: border-box; background: #fff; margin: 0; }
    .receipt-root > *:first-child { margin-top: 0 !important; padding-top: 0 !important; }
    hr { margin: 0; }
    * { box-sizing: border-box; max-width: 100%; color: #000 !important; }
    ${BRAND_FOOTER_CSS}
  </style>
</head>
<body>
  <div class="receipt-root">${bodyContent}</div>
</body>
</html>`;
}

export function generateKitchenReceiptHTML(
  orderData: any,
  options: ReceiptTemplateOptions = {},
): string {
  const items = orderData.items || [];
  const orderNumber = orderData.orderNumber || orderData.order_number || orderData.id || 'N/A';
  const serviceType = orderData.serviceType === 'dine_in' ? 'داخل سالن' : 'بیرون‌بر';
  const tableNumber = orderData.tableNumber || '';
  const customerAddress = orderData.customerAddress || '';
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
  const receiptNumber = typeof options.receiptNumber === 'number' ? options.receiptNumber : 0;

  return `
<!DOCTYPE html>
<html dir="rtl" lang="fa">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>رسید آشپزخانه</title>
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
      width: var(--paper-width); max-width: var(--paper-width);
      margin: 0; padding: 0; padding-top: 0 !important; margin-right: var(--shift-left);
    }
    body {
      font-family: ${RECEIPT_FONT_FAMILY};
      color: #000 !important;
      -webkit-font-smoothing: none;
      text-rendering: geometricPrecision;
      font-size: 12pt; font-weight: bold;
      box-sizing: border-box; direction: rtl; text-align: right; background: #fff;
    }
    .receipt-root { width: var(--printable-width); max-width: var(--printable-width); padding: var(--content-padding); margin: 0; }
    * { box-sizing: border-box; max-width: 100%; color: #000 !important; }

    .divider-solid { border-bottom: 3px solid #000; margin: 10px 0; }

    .header { text-align: center; }
    
    .receipt-number-box {
      display: inline-flex; align-items: center; justify-content: center;
      width: 25mm; height: 25mm; margin: 5px auto;
      border: 4px solid #000;
      font-size: 32pt; font-weight: bold; line-height: 1;
    }

    .order-info { margin: 12px 0; font-size: 12pt; border: 2px dashed #000; padding: 8px; border-radius: 4px; }
    .order-info div { margin: 6px 0; }

    .items { margin: 15px 0; }
    .item { display: flex; justify-content: space-between; align-items: flex-start; padding: 8px 0; border-bottom: 2px solid #000; }
    .item-name-col { flex: 1; padding-left: 10px; }
    .item-name { font-size: 10pt; }
    
    /* --- مشکل یادداشت زیر محصولات در این کلاس حل شد --- */
    .item-details { 
      font-size: 10pt; 
      margin-top: 4px; 
      font-weight: normal; 
      white-space: pre-wrap; 
      word-break: normal; 
      text-align: justify; 
      text-align-last: right;
      line-height: 1.6;
    }
    
    .item-quantity { font-size: 20pt; font-weight: bold; white-space: nowrap; margin-right: 10px; }

    .notes { 
      margin-top: 15px; 
      padding: 10px; 
      border: 3px solid #000; 
      font-size: 12pt;
      white-space: pre-wrap; 
      word-break: normal; 
      line-height: 1.6;
      text-align: justify; 
      text-align-last: right; 
    }
    
    ${BRAND_FOOTER_CSS}
    .brand-footer { margin-top: 20px; font-size: 10pt; }
  </style>
</head>
<body>
  <div class="receipt-root">
    <div class="header">
      ${receiptNumber > 0 ? `<div class="receipt-number-box">${receiptNumber}</div>` : ''}
    </div>

        <div class="order-info">
      <div>${serviceType}</div>
      ${tableNumber ? `<div><strong>میز:</strong> ${tableNumber}</div>` : ''}
      ${customerAddress ? `<div><strong>آدرس:</strong> ${customerAddress}</div>` : ''}
    </div>

    ${
      notes
        ? `
    <div class="notes">
      ${notes} 
    </div>
    `
        : ''
    }

    <div class="divider-solid"></div>

    <div class="items">
      ${items
        .map((item: any) => {
          const title = item.product?.name_fa || item.productName || 'محصول';
          const desc = getProductDescription(item);
          const lineNote = getLineItemNote(item);
          return `
        <div class="item">
          <div class="item-name-col">
            <span class="item-name">${title}</span>
            ${lineNote ? `<div class="item-details">${lineNote}</div>` : ''}
          </div>
          <div class="item-quantity">${item.quantity}${item.product?.unit && item.product.unit !== 'عدد' ? ` ${item.product.unit}` : ''} ×</div>
        </div>
      `;
        })
        .join('')}
    </div>

    ${renderBrandFooterHtml(date)}
  </div>
</body>
</html>
  `;
}
