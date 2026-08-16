import { useState, useRef, useEffect, useMemo } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { Button } from '../../../ui/compat-button';
import { getAssetBaseUrl } from '../../../services/api';
import { normalizeNameFa, smartSearchMatch } from '../../../utils/persian';

const normalizeBarcode = (value: string) =>
  String(value || '')
    .replace(/[‌‏‪-‮]/g, '')
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 1632))
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 1776))
    .replace(/\s+/g, '')
    .trim();

const MAX_THUMB_RETRIES = 3;

/**
 * Product-card photo with automatic retry-with-backoff on load failure. Restaurant
 * wifi/API hiccups intermittently fail a single image request — without this, that
 * looks exactly like "the photo disappeared" even though the product data is fine.
 * After retries are exhausted it shows a distinct placeholder (not just blank), so a
 * genuinely broken image is visually distinguishable from a product with no photo.
 */
function ProductThumb({ src, alt }: { src: string; alt: string }) {
  const [attempt, setAttempt] = useState(0);
  const [failed, setFailed] = useState(false);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setAttempt(0);
    setFailed(false);
  }, [src]);

  useEffect(() => () => {
    if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
  }, []);

  if (failed) {
    return (
      <div className="w-full h-full flex items-center justify-center text-default-300 text-[10px]">
        بدون تصویر
      </div>
    );
  }

  const bustedSrc = attempt === 0 ? src : `${src}${src.includes('?') ? '&' : '?'}_r=${attempt}`;

  return (
    <img
      src={bustedSrc}
      alt={alt}
      className="w-full h-full object-cover"
      onError={() => {
        if (attempt < MAX_THUMB_RETRIES) {
          retryTimerRef.current = setTimeout(() => setAttempt((a) => a + 1), 400 * (attempt + 1));
        } else {
          setFailed(true);
        }
      }}
    />
  );
}

interface Props {
  products: any[];
  categories: string[];
  searchTerm: string;
  onProductClick: (product: any) => void;
  onBarcodeAdd: (code: string) => void;
  formatPrice: (price: number) => string;
  staffCartUnitPrice: (product: any) => number;
  orderEditLoading?: boolean;
  isLoading?: boolean;
}

export function OrderProductGrid({
  products, categories, searchTerm,
  onProductClick, onBarcodeAdd, formatPrice, staffCartUnitPrice,
  orderEditLoading, isLoading,
}: Props) {
  const [selectedCategory, setSelectedCategory] = useState('');
  const productGridRef = useRef<HTMLDivElement>(null);
  const [colCount, setColCount] = useState(4);
  const scanBufferRef = useRef('');
  const scanLastKeyAtRef = useRef(0);

  const filteredProducts = useMemo(() => products.filter((p) => {
    const categoryMatch = !selectedCategory || p.category?.name_fa === selectedCategory;
    const term = normalizeNameFa(searchTerm).toLowerCase();
    const searchMatch = !term ||
      normalizeNameFa(p.name_fa).toLowerCase().includes(term) ||
      normalizeNameFa(p.name).toLowerCase().includes(term) ||
      smartSearchMatch(p.name_fa, searchTerm) ||
      smartSearchMatch(p.name, searchTerm);
    return categoryMatch && searchMatch;
  }), [products, selectedCategory, searchTerm]);

  useEffect(() => {
    const el = productGridRef.current;
    if (!el) return;
    // Hysteresis around the breakpoints: once a column count is picked, the width has
    // to move well past the boundary before switching away from it again. Without this,
    // a width sitting right at 640/768px can flip-flop on every ResizeObserver tick (e.g.
    // scrollbar show/hide, sub-pixel layout jitter) — each flip reshuffles every row and
    // remounts every product card/photo, which looks like photos randomly blinking out.
    const HYSTERESIS = 24;
    const calc = (w: number, current: number) => {
      if (current === 2) return w < 640 + HYSTERESIS ? 2 : w < 768 ? 3 : 4;
      if (current === 3) return w < 640 ? 2 : w < 768 + HYSTERESIS ? 3 : 4;
      return w < 640 ? 2 : w < 768 - HYSTERESIS ? 3 : 4;
    };
    const update = (w: number) => setColCount((prev) => {
      const next = calc(w, prev);
      return next === prev ? prev : next;
    });
    update(el.clientWidth);
    const obs = new ResizeObserver((entries) => update(entries[0].contentRect.width));
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  const productRows = useMemo(() => {
    const rows: (typeof filteredProducts[number])[][] = [];
    for (let i = 0; i < filteredProducts.length; i += colCount) {
      rows.push(filteredProducts.slice(i, i + colCount));
    }
    return rows;
  }, [filteredProducts, colCount]);

  const virtualizer = useVirtualizer({
    count: productRows.length,
    getScrollElement: () => productGridRef.current,
    // Card height is now fixed (image slot + text slot), so this matches exactly —
    // no post-mount remeasurement/reflow that could momentarily misplace rows.
    estimateSize: () => 104,
    overscan: 5,
    measureElement: (el) => el.getBoundingClientRect().height,
  });

  // Barcode scanner
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      // اسکنر بارکد فقط باید وقتی فوکوس روی فیلد متنی/مودالی نیست فعال شود — وگرنه
      // مثلاً تایپ شماره موبایل مشتری در مودال پرداخت و زدن Enter برای «چاپ»، به‌عنوان
      // بارکد ناموجود تفسیر می‌شود و مودال «افزودن محصول» را به‌جای عملیات مدنظر کاربر باز می‌کند.
      const active = document.activeElement as HTMLElement | null;
      if (active?.closest('input, textarea, [contenteditable="true"]') || active?.closest('[role="dialog"]')) {
        scanBufferRef.current = '';
        scanLastKeyAtRef.current = 0;
        return;
      }
      const isEnter = e.key === 'Enter' || e.code === 'NumpadEnter' || (e as any).keyCode === 13;
      const now = Date.now();
      if (isEnter) {
        const code = normalizeBarcode(scanBufferRef.current);
        scanBufferRef.current = '';
        scanLastKeyAtRef.current = 0;
        if (code.length >= 3) { e.preventDefault(); e.stopPropagation(); onBarcodeAdd(code); }
        return;
      }
      if (now - scanLastKeyAtRef.current > 250) scanBufferRef.current = '';
      scanLastKeyAtRef.current = now;
      if (e.key.length === 1) {
        scanBufferRef.current += e.key;
        const buf = scanBufferRef.current;
        if (buf.length >= 3 && buf[0] === '/' && buf[buf.length - 1] === '/') {
          const code = normalizeBarcode(buf.slice(1, -1));
          if (code.length >= 3) {
            scanBufferRef.current = '';
            scanLastKeyAtRef.current = 0;
            e.preventDefault();
            e.stopPropagation();
            onBarcodeAdd(code);
          }
        }
      }
    };
    document.addEventListener('keydown', onKeyDown, true);
    return () => document.removeEventListener('keydown', onKeyDown, true);
  }, [products, onBarcodeAdd]);

  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const active = document.activeElement as HTMLElement | null;
      if (active?.closest('input, textarea, [contenteditable="true"]') || active?.closest('[role="dialog"]')) return;
      const text = e.clipboardData?.getData('text/plain') || '';
      const code = normalizeBarcode(text);
      if (code.length < 3) return;
      e.preventDefault();
      e.stopPropagation();
      onBarcodeAdd(code);
    };
    document.addEventListener('paste', onPaste, true);
    return () => document.removeEventListener('paste', onPaste, true);
  }, [products, onBarcodeAdd]);

  const assetBase = getAssetBaseUrl();

  return (
    <div className="flex flex-row h-full min-h-0 overflow-hidden w-full">
      {/* Product grid */}
      <div ref={productGridRef} className="w-full flex-1 min-h-0 overflow-y-scroll p-2 sm:p-3 min-w-0 relative">
        {orderEditLoading && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-content1/80 text-default-600 text-sm">
            در حال بارگذاری فاکتور...
          </div>
        )}
        {isLoading ? (
          <div className="flex items-center justify-center py-12 text-default-500">در حال بارگذاری...</div>
        ) : (
          <div style={{ height: `${virtualizer.getTotalSize()}px`, position: 'relative' }}>
            {virtualizer.getVirtualItems().map((virtualRow) => (
              <div
                key={virtualRow.index}
                ref={virtualizer.measureElement}
                data-index={virtualRow.index}
                style={{
                  position: 'absolute', top: 0, left: 0, right: 0,
                  transform: `translateY(${virtualRow.start}px)`,
                  display: 'grid',
                  gridTemplateColumns: `repeat(${colCount}, minmax(0, 1fr))`,
                  gap: '0.5rem', paddingBottom: '0.5rem',
                }}
              >
                {productRows[virtualRow.index].map((product) => (
                  <button
                    key={product.id}
                    type="button"
                    className="flex rounded-lg border border-default-200 bg-content1 text-start overflow-hidden outline-none transition hover:border-primary hover:shadow-sm focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-content1 p-0 cursor-pointer"
                    onClick={() => onProductClick(product)}
                  >
                    {/* Fixed-height slot for every card (with or without a photo) so row
                        height never depends on content — keeps the virtualizer's row
                        offsets stable and prevents rows from overlapping/hiding images. */}
                    {product.multiMedia?.url && (
                    <div className="w-10 h-10 sm:h-14 sm:w-14 shrink-0 bg-default-100">
                        <ProductThumb
                          src={`${assetBase}${product.multiMedia.url}`}
                          alt={product.name_fa || product.name}
                        />
                    </div>
                    )}
                    <div className="px-1.5 py-1 text-right h-14 overflow-hidden">
                      <span className="font-semibold text-foreground text-[11px] leading-tight line-clamp-2 block">
                        {product.name_fa || product.name}
                      </span>
                      <span className="text-primary text-[11px] mt-0.5 block tabular-nums">
                        {formatPrice(staffCartUnitPrice(product))}
                      </span>
                    </div>
                  </button>
                ))}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Category sidebar */}
      <aside className="w-52 flex-shrink-0 border-r border-default-200 p-4 flex flex-col gap-2 overflow-y-auto">
        <span className="mb-1 w-full text-right text-sm font-semibold text-foreground">دسته‌بندی‌ها</span>
        <Button
          size="sm" fullWidth
          variant={selectedCategory === '' ? 'solid' : 'bordered'}
          color="primary"
          className="h-auto min-h-8 max-w-full justify-start py-2 text-right"
          onPress={() => setSelectedCategory('')}
        >
          همه
        </Button>
        {categories.map((cat) => (
          <Button
            key={cat} size="sm" fullWidth
            variant={selectedCategory === cat ? 'solid' : 'bordered'}
            color="primary"
            className="h-auto min-h-8 max-w-full justify-start whitespace-normal py-2 text-right leading-snug"
            onPress={() => setSelectedCategory(cat)}
          >
            {cat}
          </Button>
        ))}
      </aside>
    </div>
  );
}
