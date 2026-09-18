import { useState, useRef, useEffect, useMemo } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { getAssetBaseUrl } from '../../../services/api';
import { normalizeNameFa, smartSearchMatch } from '../../../utils/persian';
import { useCatalogDisplayStore } from '../../../store/catalogDisplayStore';

const normalizeBarcode = (value: string) =>
  String(value || '')
    .replace(/[‌‏‪-‮]/g, '')
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 1632))
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 1776))
    .replace(/\s+/g, '')
    .trim();

const MAX_THUMB_RETRIES = 3;

/** Generic "no photo" glyph — deliberately not food/retail-specific since a product
 * here might be a pizza, a haircut service, or a laptop. */
function ImagePlaceholderIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <circle cx="8.5" cy="8.5" r="1.5" />
      <path d="M21 15l-5-5L5 21" />
    </svg>
  );
}

function ImagePlaceholder() {
  return (
    <div className="w-full h-full flex items-center justify-center text-muted bg-default-soft">
      <ImagePlaceholderIcon className="w-6 h-6 sm:w-8 sm:h-8" />
    </div>
  );
}

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

  if (failed) return <ImagePlaceholder />;

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

/**
 * Category accent dots — purely positional/deterministic (hash of the category's own
 * name → a fixed generic palette), never tied to a specific business type or category
 * name. Any dataset (food, retail, services…) gets the same visual variety for free.
 */
const CATEGORY_ACCENTS = [
  'oklch(0.62 0.19 25)',
  'oklch(0.68 0.16 55)',
  'oklch(0.75 0.15 95)',
  'oklch(0.62 0.14 145)',
  'oklch(0.62 0.11 175)',
  'oklch(0.58 0.14 254)',
  'oklch(0.55 0.18 300)',
  'oklch(0.62 0.19 340)',
];

function categoryAccent(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i += 1) hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
  return CATEGORY_ACCENTS[hash % CATEGORY_ACCENTS.length];
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
  const showProductImages = useCatalogDisplayStore((s) => s.showProductImages);
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

  // تعداد واقعی محصولات هر دسته — از خودِ داده محاسبه می‌شود (هیچ دسته/شمارشی Hard-Code نیست)
  const categoryCounts = useMemo(() => {
    const map = new Map<string, number>();
    for (const p of products) {
      const name = p.category?.name_fa;
      if (!name) continue;
      map.set(name, (map.get(name) || 0) + 1);
    }
    return map;
  }, [products]);

  useEffect(() => {
    const el = productGridRef.current;
    if (!el) return;
    // Hysteresis around the breakpoints: once a column count is picked, the width has
    // to move well past the boundary before switching away from it again. Without this,
    // a width sitting right at a boundary can flip-flop on every ResizeObserver tick
    // (e.g. scrollbar show/hide, sub-pixel layout jitter) — each flip reshuffles every
    // row and remounts every product card/photo, which looks like photos randomly
    // blinking out.
    const HYSTERESIS = 24;
    // [minWidth, columns] — ordered ascending; widen this table (not the density of any
    // one card) to add more columns on larger screens.
    const BREAKPOINTS: [number, number][] = [
      [0, 2], [480, 3], [640, 4], [860, 5], [1080, 6],
    ];
    const colsForWidth = (w: number) => {
      let cols = BREAKPOINTS[0][1];
      for (const [minWidth, c] of BREAKPOINTS) if (w >= minWidth) cols = c;
      return cols;
    };
    const calc = (w: number, current: number) => {
      const up = colsForWidth(w);
      const down = colsForWidth(Math.max(0, w - HYSTERESIS));
      // فقط وقتی از current فاصله بگیرد تغییر کن (پایین‌ترِ دو گزینه به‌عنوان مرز پایداری)
      if (up === current || down === current) return current;
      return up;
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
    // Rough guess only — card height varies with column width (image is aspect-ratio
    // based), so `measureElement` below corrects it after mount.
    estimateSize: () => 168,
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
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-surface/80 text-foreground/70 text-sm">
            در حال بارگذاری فاکتور...
          </div>
        )}
        {isLoading ? (
          <div className="flex items-center justify-center py-12 text-muted">در حال بارگذاری...</div>
        ) : filteredProducts.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-1 py-16 text-muted text-sm text-center">
            {searchTerm
              ? <p>نتیجه‌ای برای «{searchTerm}» یافت نشد</p>
              : selectedCategory
                ? <p>محصولی در این دسته وجود ندارد</p>
                : <p>هنوز محصولی ثبت نشده است</p>}
          </div>
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
                  gap: '0.625rem', paddingBottom: '0.625rem',
                }}
              >
                {productRows[virtualRow.index].map((product) => (
                  <button
                    key={product.id}
                    type="button"
                    className="group flex flex-col rounded-xl border border-border bg-surface text-start overflow-hidden outline-none transition hover:border-accent hover:shadow-md focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-surface p-0 cursor-pointer"
                    onClick={() => onProductClick(product)}
                  >
                    {/* Fixed aspect-ratio slot for every card (with or without a photo) so row
                        height only depends on column width — keeps the virtualizer's row
                        offsets stable and prevents rows from overlapping/hiding images.
                        قابل غیرفعال‌سازی از تنظیمات (نمایش عکس محصولات) برای فشرده‌تر/سریع‌تر شدن گرید. */}
                    {showProductImages && (
                      <div className="relative w-full aspect-[4/3] shrink-0 bg-default-soft overflow-hidden">
                        {product.multiMedia?.url ? (
                          <ProductThumb
                            src={`${assetBase}${product.multiMedia.url}`}
                            alt={product.name_fa || product.name}
                          />
                        ) : (
                          <ImagePlaceholder />
                        )}
                      </div>
                    )}
                    <div className="flex flex-1 flex-col gap-1 px-2 py-1.5 text-right min-h-0">
                      <span className="font-semibold text-foreground text-xs sm:text-sm leading-tight line-clamp-2 min-h-[2.4em]">
                        {product.name_fa || product.name}
                      </span>
                      <div className="mt-auto flex items-center justify-end pt-0.5">
                        <span className="text-accent text-sm sm:text-base font-bold tabular-nums">
                          {formatPrice(staffCartUnitPrice(product))}
                        </span>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Category sidebar — سمت چپ لیست محصولات، بر اساس دادهٔ سرور: بدون هیچ دسته/آیکون Hard-Code شده.
          نقطهٔ رنگی هر ردیف صرفاً برای تمایز بصری است و از هش نام دسته ساخته می‌شود. */}
      <aside className="w-56 flex-shrink-0 border-s border-border p-3 flex flex-col overflow-y-auto bg-surface">
        <span className="mb-2 w-full text-right text-sm font-semibold text-foreground px-1 pb-2 border-b border-border">دسته‌بندی‌ها</span>
        <div className="flex flex-col divide-y divide-border">
          <button
            type="button"
            onClick={() => setSelectedCategory('')}
            className={[
              'flex w-full items-center justify-between gap-2 rounded-lg px-2.5 py-2.5 text-right text-sm transition',
              selectedCategory === ''
                ? 'bg-accent text-accent-foreground font-semibold shadow-sm'
                : 'text-foreground/80 hover:bg-default-soft',
            ].join(' ')}
          >
            <span>همه</span>
            <span className={[
              'shrink-0 rounded-full px-1.5 py-0.5 text-[10px] tabular-nums',
              selectedCategory === '' ? 'bg-white/25' : 'bg-default-soft text-muted',
            ].join(' ')}>
              {products.length}
            </span>
          </button>
          {categories.length === 0 ? (
            <p className="px-2.5 py-2 text-xs text-muted">هنوز دسته‌بندی‌ای ایجاد نشده است</p>
          ) : categories.map((cat) => {
            const isActive = selectedCategory === cat;
            return (
              <button
                key={cat}
                type="button"
                onClick={() => setSelectedCategory(cat)}
                className={[
                  'flex w-full items-center justify-between gap-2 rounded-lg px-2.5 py-2.5 text-right text-sm transition',
                  isActive
                    ? 'bg-accent text-accent-foreground font-semibold shadow-sm'
                    : 'text-foreground/80 hover:bg-default-soft',
                ].join(' ')}
              >
                <span className="flex min-w-0 items-center gap-2">
                  <span
                    aria-hidden
                    className="h-2 w-2 shrink-0 rounded-full"
                    style={{ backgroundColor: isActive ? 'currentColor' : categoryAccent(cat) }}
                  />
                  <span className="truncate leading-snug whitespace-normal">{cat}</span>
                </span>
                <span className={[
                  'shrink-0 rounded-full px-1.5 py-0.5 text-[10px] tabular-nums',
                  isActive ? 'bg-white/25' : 'bg-default-soft text-muted',
                ].join(' ')}>
                  {categoryCounts.get(cat) ?? 0}
                </span>
              </button>
            );
          })}
        </div>
      </aside>
    </div>
  );
}
