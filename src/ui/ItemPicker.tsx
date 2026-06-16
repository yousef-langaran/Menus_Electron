import { useEffect, useMemo, useRef, useState, type FocusEvent as ReactFocusEvent, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { createPortal } from 'react-dom';
import { useFilter } from '@heroui/react';
import { Input } from './compat-input';
import { smartSearchMatch } from '../utils/persian';

export type PickerOption = { id: string; label: string };

/**
 * حداکثر تعداد گزینه‌هایی که هم‌زمان رندر می‌شوند.
 * با کاتالوگ‌های بزرگ (۲۰۰۰+ محصول) رندر کردن همهٔ آیتم‌ها داخل ListBox
 * باعث لگ و کرش می‌شد؛ این‌جا فیلتر/برش را خودمان در JS انجام می‌دهیم و فقط
 * یک برش کوچک به DOM می‌رسد.
 */
const PICKER_RENDER_CAP = 50;

/**
 * انتخابگر محصول/ماده اولیه با جستجو.
 *
 * چرا دستی پیاده شده و از HeroUI Autocomplete استفاده نمی‌کند؟
 * این انتخابگر معمولاً داخل یک Modal (دیالوگ React Aria) رندر می‌شود. مودال فوکوس
 * را با FocusScope محصور می‌کند و فیلدِ تایپِ داخلِ هر overlay/portal کیبورد
 * نمی‌گیرد. راه‌حلِ اثبات‌شده در این پروژه (مثل NameAutocomplete): فیلدِ تایپ را
 * به‌صورت inline داخل خود مودال نگه می‌داریم و فقط لیستِ گزینه‌ها (که صرفاً
 * کلیک می‌شود) را به نزدیک‌ترین dialog منتقل می‌کنیم. ضمناً فقط
 * PICKER_RENDER_CAP موردِ تطبیق‌یافته رندر می‌شود تا با کاتالوگ‌های بزرگ
 * (۲۰۰۰+ محصول) لگ/کرش رخ ندهد.
 */
export function ItemPicker({
  options,
  value,
  onChange,
  label,
  placeholder,
}: {
  options: PickerOption[];
  value: string | null;
  onChange: (key: string) => void;
  label: string;
  placeholder: string;
}) {
  const { contains } = useFilter({ sensitivity: 'base' });
  const wrapperRef = useRef<HTMLDivElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  /**
   * query === null  → فیلد برچسبِ موردِ انتخاب‌شده را نشان می‌دهد (حالت نمایش).
   * query === string → کاربر در حال تایپ/جستجوست (حالت ویرایش).
   *
   * چرا null به‌جای ''؟ هنگام انتخاب با onMouseDown، بعد از بسته‌شدن لیست، فوکوس
   * دوباره به اینپوت برمی‌گردد و onFocus اجرا می‌شود. اگر در آن لحظه query را ''
   * کنیم فیلد خالی می‌شود و انتخاب کاربر دیده نمی‌شود. با null، تا وقتی کاربر
   * عملاً تایپ نکند، همیشه برچسبِ انتخاب‌شده نمایش داده می‌شود.
   */
  const [query, setQuery] = useState<string | null>(null);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const [portalEl, setPortalEl] = useState<HTMLElement | null>(null);

  const selectedLabel = useMemo(
    () => options.find((o) => o.id === value)?.label ?? '',
    [options, value],
  );

  // متنِ دیده‌شده در فیلد: حالت ویرایش → query، حالت نمایش → برچسبِ انتخاب‌شده.
  const inputValue = query !== null ? query : selectedLabel;

  const { visible, totalMatches } = useMemo(() => {
    const q = (query ?? '').trim();
    const matched = q ? options.filter((o) => contains(o.label, q) || smartSearchMatch(o.label, q)) : options;
    return { visible: matched.slice(0, PICKER_RENDER_CAP), totalMatches: matched.length };
  }, [options, query, contains]);

  useEffect(() => {
    let el: HTMLElement | null = wrapperRef.current;
    while (el) {
      if (el.getAttribute('role') === 'dialog') { setPortalEl(el); return; }
      el = el.parentElement;
    }
    setPortalEl(document.body);
  }, []);

  useEffect(() => {
    if (!open) return;
    setRect(wrapperRef.current?.getBoundingClientRect() ?? null);
  }, [open, query]);

  useEffect(() => {
    if (!open) return;
    const handle = (e: PointerEvent) => {
      if (
        wrapperRef.current?.contains(e.target as Node) ||
        dropdownRef.current?.contains(e.target as Node)
      ) return;
      setOpen(false);
      setQuery(null);
    };
    document.addEventListener('pointerdown', handle);
    return () => document.removeEventListener('pointerdown', handle);
  }, [open]);

  const handleSelect = (id: string) => {
    onChange(id);
    setOpen(false);
    setQuery(null);
  };

  const dropdownOpen = open && rect && portalEl && options.length > 0;

  return (
    <div ref={wrapperRef} className="w-full">
      <Input
        label={label}
        value={inputValue}
        placeholder={placeholder}
        onFocus={(e: ReactFocusEvent<HTMLInputElement>) => {
          setOpen(true);
          // متنِ موجود را انتخاب کن تا با شروعِ تایپ جایگزین شود (نه اضافه‌شدن به انتها).
          e.target.select?.();
        }}
        onClick={() => setOpen(true)}
        onValueChange={(v) => { setQuery(v); if (!open) setOpen(true); }}
        onKeyDown={(e: ReactKeyboardEvent<HTMLInputElement>) => {
          if (e.key === 'Escape') { setOpen(false); setQuery(null); (e.target as HTMLInputElement).blur(); }
        }}
        endContent={
          <svg
            className={`w-4 h-4 shrink-0 text-default-400 transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
            fill="none" stroke="currentColor" viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        }
      />

      {dropdownOpen &&
        createPortal(
          <div
            ref={dropdownRef}
            dir="rtl"
            style={{
              position: 'fixed',
              top: rect!.bottom + 6,
              right: window.innerWidth - rect!.right,
              width: rect!.width,
              zIndex: 99999,
            }}
            className="rounded-xl border border-[var(--border)] bg-[var(--overlay)] shadow-[var(--overlay-shadow)] overflow-hidden"
          >
            <div className="overflow-y-auto" style={{ maxHeight: '260px' }}>
              {visible.length === 0 ? (
                <p className="px-4 py-5 text-center text-sm text-default-400">موردی یافت نشد</p>
              ) : (
                visible.map((opt) => {
                  const isSelected = opt.id === value;
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      onMouseDown={(e) => { e.preventDefault(); handleSelect(opt.id); }}
                      className={`flex w-full items-center justify-between gap-3 px-4 py-2.5 text-right text-sm transition-colors duration-100
                        ${isSelected
                          ? 'bg-[var(--accent-soft)] text-[var(--accent-soft-foreground)] font-medium'
                          : 'text-[var(--overlay-foreground)] hover:bg-[var(--accent-soft-hover)]'
                        }`}
                    >
                      <span className="truncate">{opt.label}</span>
                      {isSelected && (
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" className="shrink-0 text-[var(--accent)]">
                          <path d="m5 12 5 5 9-9" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      )}
                    </button>
                  );
                })
              )}
            </div>
            {totalMatches > visible.length && (
              <p className="border-t border-[var(--separator)] px-4 py-2 text-xs text-default-400">
                نمایش {visible.length} از {totalMatches} — برای یافتن دقیق‌تر جستجو کنید
              </p>
            )}
          </div>,
          portalEl,
        )}
    </div>
  );
}
