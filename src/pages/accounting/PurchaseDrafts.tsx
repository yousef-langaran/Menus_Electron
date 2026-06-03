import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { toShamsiDate } from '../../utils/date';
import { Card, CardContent, Chip, Modal, ModalBody, ModalFooter, ModalHeader, Spinner, Tabs, useFilter } from '@heroui/react';
import { Button } from '../../ui/compat-button';
import { Input } from '../../ui/compat-input';
import { ModalShell } from '../../ui/modal-shell';
import { Select, SelectItem } from '../../ui/compat-select';
import { ShamsiDatePicker } from '../../ui/ShamsiDatePicker';
import { useAuthStore } from '../../store/authStore';
import { useSyncStore } from '../../store/syncStore';
import {
  accountingDb,
  createPurchaseInvoiceLocal,
  deletePurchaseInvoiceDraftLocal,
  getDefaultWarehouseLocal,
  getOrCreateFinalProductByProductId,
  getPurchaseInvoiceItemsByInvoiceId,
  resetAccountingPullTimestamp,
  resetEntitySyncOperationsToPending,
  resetFailedPurchaseDraftsToPending,
  updatePurchaseInvoiceDraftLocal,
} from '../../services/accountingLocalDb';
import { createProductLocal, getLocalCategories, getLocalProducts } from '../../services/catalogLocalDb';
import { getMasterProductByBarcode, updateAccountingPurchaseInvoiceStatus } from '../../services/api';
import { toast } from '../../utils/toast';

const SYNC_STATUS_CONFIG: Record<string, { label: string; color: 'warning' | 'success' | 'danger' | 'default' }> = {
  pending: { label: 'در صف ارسال', color: 'warning' },
  syncing: { label: 'در حال ارسال', color: 'default' },
  synced: { label: 'سینک شده', color: 'success' },
  failed: { label: 'ارسال ناموفق', color: 'danger' },
};

const INVOICE_STATUS_CONFIG: Record<string, { label: string; color: 'warning' | 'success' | 'danger' | 'default' | 'primary' }> = {
  draft: { label: 'پیش‌نویس', color: 'default' },
  pending_approval: { label: 'در انتظار تایید', color: 'warning' },
  approved: { label: 'تایید شده', color: 'success' },
  rejected: { label: 'رد شده', color: 'danger' },
};

const normalizePriceInput = (value: string) =>
  String(value || '')
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 1632))
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 1776))
    .replace(/[^\d]/g, '');

const normalizeBarcode = (value: string) =>
  String(value || '')
    .replace(/[‌‏‪-‮]/g, '')
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 1632))
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 1776))
    .replace(/\s+/g, '')
    .replace(/^\/+|\/+$/g, '')
    .trim();

const formatPriceInput = (value: string) => {
  const digits = normalizePriceInput(value);
  if (!digits) return '';
  return new Intl.NumberFormat('en-US').format(Number(digits));
};

const formatCurrency = (n: number) =>
  new Intl.NumberFormat('fa-IR').format(Math.round(n)) + ' ریال';

const toJalali = (isoDate?: string) => toShamsiDate(isoDate);

type ItemType = 'raw_material' | 'final_product';

type DraftItem = {
  type: ItemType;
  /** accounting rawMaterial ID */
  rawMaterialId: string;
  /** menu product ID — shown in UI for final_product rows */
  menuProductId: string;
  /** accounting FinalProduct ID — resolved on save / loaded on edit */
  finalProductId: string;
  quantity: string;
  /** قیمت کل خرید این ردیف (کاربر کل را وارد می‌کند؛ قیمت تکی = کل ÷ مقدار) */
  totalPrice: string;
  /** قیمت فروش (اختیاری) */
  salePrice: string;
};

const emptyItem = (): DraftItem => ({
  type: 'raw_material',
  rawMaterialId: '',
  menuProductId: '',
  finalProductId: '',
  quantity: '1',
  totalPrice: '0',
  salePrice: '',
});

type PickerOption = { id: string; label: string };

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
 * این انتخابگر داخل یک Modal (دیالوگ React Aria) رندر می‌شود. مودال فوکوس را با
 * FocusScope محصور می‌کند و فیلدِ تایپِ داخلِ هر overlay/portal کیبورد نمی‌گیرد.
 * راه‌حلِ اثبات‌شده در این پروژه (مثل NameAutocomplete): فیلدِ تایپ را به‌صورت
 * inline داخل خود مودال نگه می‌داریم و فقط لیستِ گزینه‌ها (که صرفاً کلیک می‌شود)
 * را به نزدیک‌ترین dialog منتقل می‌کنیم. ضمناً فقط PICKER_RENDER_CAP موردِ
 * تطبیق‌یافته رندر می‌شود تا با کاتالوگ‌های بزرگ (۲۰۰۰+ محصول) لگ/کرش رخ ندهد.
 */
function ItemPicker({
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
  const [query, setQuery] = useState('');
  const [rect, setRect] = useState<DOMRect | null>(null);
  const [portalEl, setPortalEl] = useState<HTMLElement | null>(null);

  const selectedLabel = useMemo(
    () => options.find((o) => o.id === value)?.label ?? '',
    [options, value],
  );

  const { visible, totalMatches } = useMemo(() => {
    const q = query.trim();
    const matched = q ? options.filter((o) => contains(o.label, q)) : options;
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
      setQuery('');
    };
    document.addEventListener('pointerdown', handle);
    return () => document.removeEventListener('pointerdown', handle);
  }, [open]);

  const handleSelect = (id: string) => {
    onChange(id);
    setOpen(false);
    setQuery('');
  };

  const dropdownOpen = open && rect && portalEl && options.length > 0;

  return (
    <div ref={wrapperRef} className="w-full">
      <Input
        label={label}
        value={open ? query : selectedLabel}
        placeholder={placeholder}
        onFocus={() => { setOpen(true); setQuery(''); }}
        onClick={() => setOpen(true)}
        onValueChange={(v) => { setQuery(v); if (!open) setOpen(true); }}
        onKeyDown={(e: ReactKeyboardEvent<HTMLInputElement>) => {
          if (e.key === 'Escape') { setOpen(false); setQuery(''); (e.target as HTMLInputElement).blur(); }
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

export default function AccountingPurchaseDraftsPage() {
  const navigate = useNavigate();
  const { user, token } = useAuthStore((s) => ({ user: s.user, token: s.token }));
  const restaurantId = user?.restaurants?.[0]?.id;

  const lastSyncedAt = useSyncStore((s) => s.lastSyncedAt);
  const isSyncing = useSyncStore((s) => s.isSyncing);

  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [materials, setMaterials] = useState<any[]>([]);
  const [menuProducts, setMenuProducts] = useState<any[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  /** accounting finalProducts — used only to resolve IDs when loading saved items */
  const [accountingFinalProducts, setAccountingFinalProducts] = useState<any[]>([]);
  const [drafts, setDrafts] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Form state
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [isViewMode, setIsViewMode] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [invoiceNumber, setInvoiceNumber] = useState('');
  const [supplierId, setSupplierId] = useState('');
  const [extraCosts, setExtraCosts] = useState('0');
  const [purchaseDate, setPurchaseDate] = useState(new Date().toISOString().slice(0, 10));
  const [items, setItems] = useState<DraftItem[]>([]);

  // Barcode scan UX
  const [scanValue, setScanValue] = useState('');
  const [flashIdx, setFlashIdx] = useState<number | null>(null);
  const barcodeRef = useRef<HTMLInputElement>(null);
  const qtyRefs = useRef<Record<number, HTMLInputElement | null>>({});
  const pendingFocusIdx = useRef<number | null>(null);

  /** پس از افزودن/افزایش از طریق بارکد، فوکوس را به فیلد تعداد همان ردیف می‌برد */
  const requestQtyFocus = useCallback((idx: number) => {
    pendingFocusIdx.current = idx;
    setFlashIdx(idx);
  }, []);

  // وقتی آیتم‌ها رندر شدند، فوکوس را روی فیلد تعداد ردیف هدف می‌گذارد و متنش را انتخاب می‌کند
  useEffect(() => {
    const idx = pendingFocusIdx.current;
    if (idx == null) return;
    const el = qtyRefs.current[idx];
    if (el) {
      el.focus();
      el.select?.();
      pendingFocusIdx.current = null;
    }
  }, [items]);

  // هایلایت ردیف تازه‌اضافه‌شده را بعد از کمی زمان پاک می‌کند
  useEffect(() => {
    if (flashIdx == null) return;
    const t = setTimeout(() => setFlashIdx(null), 900);
    return () => clearTimeout(t);
  }, [flashIdx]);

  // با باز شدن مودال، فوکوس را روی فیلد بارکد بگذار (بر focus-trap پیش‌فرض مودال غلبه می‌کند)
  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => barcodeRef.current?.focus(), 120);
    return () => clearTimeout(t);
  }, [open]);

  // Add product modal — opened when a scanned barcode is not found
  const [addProductOpen, setAddProductOpen] = useState(false);
  const [addProductBarcode, setAddProductBarcode] = useState('');
  const [addProductName, setAddProductName] = useState('');
  const [addProductCategoryId, setAddProductCategoryId] = useState('');
  const [addProductSalePrice, setAddProductSalePrice] = useState('');
  const [addProductPurchasePrice, setAddProductPurchasePrice] = useState('');
  const [isCheckingMasterProduct, setIsCheckingMasterProduct] = useState(false);
  const [addProductSubmitting, setAddProductSubmitting] = useState(false);

  const reload = useCallback(async () => {
    if (!restaurantId) return;
    const [s, m, afp, d, mp, cats] = await Promise.all([
      accountingDb.suppliers.where('restaurantId').equals(restaurantId).reverse().sortBy('id'),
      accountingDb.rawMaterials.where('restaurantId').equals(restaurantId).reverse().sortBy('id'),
      accountingDb.finalProducts.where('restaurantId').equals(restaurantId).toArray(),
      accountingDb.purchaseInvoices.where('restaurantId').equals(restaurantId).reverse().sortBy('id'),
      getLocalProducts(restaurantId).then((r) =>
        // محصولات تازه‌ساخته‌شدهٔ آفلاین (pending_create) هم باید قابل انتخاب/ذخیره باشند
        r.data.filter((p) => p._syncStatus === 'synced' || p._syncStatus === 'pending_create'),
      ),
      getLocalCategories(restaurantId),
    ]);
    setSuppliers(s);
    setMaterials(m);
    setAccountingFinalProducts(afp);
    setDrafts(d);
    setMenuProducts(mp);
    setCategories(cats);
    setIsLoading(false);
  }, [restaurantId]);

  useEffect(() => { void reload(); }, [reload]);

  // Reload whenever accounting sync finishes
  useEffect(() => {
    if (!lastSyncedAt) return;
    void reload();
  }, [lastSyncedAt, reload]);

  // ── option lists ──────────────────────────────────────────────────────────

  const materialOptions = useMemo(
    () => materials.map((x) => ({ id: String(x.id), label: x.name })),
    [materials],
  );

  /** محصولات منو به‌عنوان گزینه‌های محصول نهایی */
  const menuProductOptions = useMemo(
    () => menuProducts.map((x) => ({ id: String(x.id), label: x.name_fa || x.name })),
    [menuProducts],
  );


  const runningTotal = useMemo(() => {
    const itemsSum = items.reduce((acc, item) => {
      return acc + Number(normalizePriceInput(item.totalPrice) || 0);
    }, 0);
    return itemsSum + Number(normalizePriceInput(extraCosts) || 0);
  }, [items, extraCosts]);

  // ── helpers ───────────────────────────────────────────────────────────────

  const updateItem = (idx: number, patch: Partial<DraftItem>) =>
    setItems((prev) => prev.map((x, i) => (i === idx ? { ...x, ...patch } : x)));

  const openCreate = () => {
    setEditingId(null);
    setIsViewMode(false);
    setInvoiceNumber('');
    setSupplierId('');
    setExtraCosts('0');
    setPurchaseDate(new Date().toISOString().slice(0, 10));
    setItems([]);
    setScanValue('');
    setOpen(true);
  };

  const loadInvoiceIntoModal = async (d: any, viewOnly: boolean) => {
    const lines = await getPurchaseInvoiceItemsByInvoiceId(d.id);
    setEditingId(viewOnly ? null : d.id);
    setIsViewMode(viewOnly);
    setInvoiceNumber(d.invoiceNumber);
    setSupplierId(String(d.supplierId || ''));
    setExtraCosts(String(d.extraCosts || '0'));
    setPurchaseDate(d.purchaseDate || new Date().toISOString().slice(0, 10));
    setItems(
      lines.map((x: any) => {
        const hasFinal = x.finalProductId && Number(x.finalProductId) > 0;
        const acctFp = hasFinal
          ? accountingFinalProducts.find((fp) => fp.id === Number(x.finalProductId))
          : null;
        return {
          type: (hasFinal ? 'final_product' : 'raw_material') as ItemType,
          rawMaterialId: String(x.rawMaterialId || ''),
          menuProductId: String(acctFp?.productId || ''),
          finalProductId: String(x.finalProductId || ''),
          quantity: String(x.quantity),
          totalPrice: String(Number(x.unitPrice || 0) * Number(x.quantity || 0)),
          salePrice: x.salePrice != null ? String(x.salePrice) : '',
        };
      }),
    );
    setScanValue('');
    setOpen(true);
  };

  // ── save ──────────────────────────────────────────────────────────────────

  const handleSave = async () => {
    if (!restaurantId || !supplierId || !invoiceNumber.trim()) {
      toast.error('شماره فاکتور و تامین‌کننده الزامی است');
      return;
    }

    // Resolve menuProductId → accounting FinalProduct ID for final_product rows
    const resolved = await Promise.all(
      items.map(async (x) => {
        const qty = Number(x.quantity || 0);
        // کاربر قیمت کل ردیف را وارد می‌کند؛ قیمت تکی خودکار محاسبه می‌شود.
        const totalPrice = Number(normalizePriceInput(x.totalPrice) || 0);
        const unitPrice = qty > 0 ? totalPrice / qty : 0;

        const salePriceVal = normalizePriceInput(x.salePrice);
        const salePrice = salePriceVal ? Number(salePriceVal) : undefined;

        if (x.type === 'final_product') {
          if (!x.menuProductId || qty <= 0) return null;
          const menuProd = menuProducts.find((p) => String(p.id) === x.menuProductId);
          if (!menuProd) return null;
          const fpId = await getOrCreateFinalProductByProductId(
            restaurantId,
            Number(x.menuProductId),
            menuProd.name_fa || menuProd.name,
          );
          return { finalProductId: fpId, quantity: qty, unitPrice, salePrice };
        } else {
          if (!x.rawMaterialId || qty <= 0) return null;
          return { rawMaterialId: Number(x.rawMaterialId), quantity: qty, unitPrice, salePrice };
        }
      }),
    );

    const lines = resolved.filter(Boolean) as Array<{
      rawMaterialId?: number;
      finalProductId?: number;
      quantity: number;
      unitPrice: number;
    }>;

    if (!lines.length) {
      toast.error('حداقل یک آیتم معتبر با مقدار بیشتر از صفر وارد کنید.');
      return;
    }

    setIsSaving(true);
    try {
      const defaultWarehouse = await getDefaultWarehouseLocal(restaurantId);
      const defaultWarehouseId = defaultWarehouse?.id as number | undefined;
      const linesWithWarehouse = lines.map((x) => ({ ...x, warehouseId: defaultWarehouseId }));

      if (editingId) {
        await updatePurchaseInvoiceDraftLocal({
          invoiceId: editingId,
          restaurantId,
          supplierId: Number(supplierId),
          invoiceNumber: invoiceNumber.trim(),
          purchaseDate,
          items: linesWithWarehouse,
          extraCosts: Number(normalizePriceInput(extraCosts) || 0),
        });
        toast.success('پیش‌نویس ویرایش شد');
      } else {
        await createPurchaseInvoiceLocal({
          restaurantId,
          supplierId: Number(supplierId),
          invoiceNumber: invoiceNumber.trim(),
          purchaseDate,
          items: linesWithWarehouse,
          extraCosts: Number(normalizePriceInput(extraCosts) || 0),
        });
        toast.success('پیش‌نویس ذخیره شد');
      }
      setOpen(false);
      await reload();
    } catch {
      toast.error('خطا در ذخیره‌سازی. لطفاً دوباره تلاش کنید.');
    } finally {
      setIsSaving(false);
    }
  };

  // ── barcode ───────────────────────────────────────────────────────────────

  /** یک ردیف موجود را افزایش یا ردیف جدید می‌سازد و فوکوس را روی تعدادش می‌برد */
  const addOrIncrementRow = useCallback(
    (match: (x: DraftItem) => boolean, build: () => DraftItem) => {
      const existingIdx = items.findIndex(match);
      if (existingIdx !== -1) {
        setItems((prev) =>
          prev.map((x, i) =>
            i === existingIdx
              ? { ...x, quantity: String(Number(x.quantity || 1) + 1) }
              : x,
          ),
        );
        requestQtyFocus(existingIdx);
      } else {
        const newIdx = items.length;
        setItems((prev) => [...prev, build()]);
        requestQtyFocus(newIdx);
      }
    },
    [items, requestQtyFocus],
  );

  const handleBarcodeApply = useCallback(async (code: string) => {
    const c = normalizeBarcode(code);
    if (!c) return;

    // ۱) تطبیق با مواد اولیهٔ ثبت‌شده
    const matched = materials.find((m) => normalizeBarcode(m.barcode || '') === c);
    if (matched) {
      addOrIncrementRow(
        (x) => x.type === 'raw_material' && x.rawMaterialId === String(matched.id),
        () => ({ ...emptyItem(), type: 'raw_material', rawMaterialId: String(matched.id) }),
      );
      return;
    }

    // ۲) تطبیق با محصولات منو
    const matchedProduct = menuProducts.find((p) => normalizeBarcode(p.barcode || '') === c);
    if (matchedProduct) {
      addOrIncrementRow(
        (x) => x.type === 'final_product' && x.menuProductId === String(matchedProduct.id),
        () => ({ ...emptyItem(), type: 'final_product', menuProductId: String(matchedProduct.id) }),
      );
      return;
    }

    // ۳) یافت نشد → مودال افزودن «محصول» جدید
    setAddProductBarcode(c);
    setAddProductName('');
    setAddProductCategoryId(
      String(categories.find((cat) => cat._syncStatus === 'synced')?.id || categories[0]?.id || ''),
    );
    setAddProductSalePrice('');
    setAddProductPurchasePrice('');
    setIsCheckingMasterProduct(true);
    setAddProductOpen(true);
    try {
      const master = await getMasterProductByBarcode(c, token || undefined);
      if (master) setAddProductName(master.name);
    } finally {
      setIsCheckingMasterProduct(false);
    }
  }, [materials, menuProducts, categories, token, addOrIncrementRow]);

  // اسکنر بارکد: کاراکترها را خیلی سریع (با فاصله < ~50ms) تایپ می‌کند و با Enter تمام می‌شود.
  // این listener به‌عنوان شبکهٔ ایمنی کار می‌کند تا حتی وقتی فوکوس داخل فیلد تعداد/قیمت است،
  // اسکن کالا باز هم اضافه شود. فیلد بارکد اختصاصی خودش onKeyDown دارد و اینجا نادیده گرفته می‌شود.
  useEffect(() => {
    if (!open) return;
    let buffer = '';
    let lastTime = 0;

    const onKey = (e: KeyboardEvent) => {
      // فیلد بارکد اختصاصی خودش این رویداد را مدیریت می‌کند
      if (e.target === barcodeRef.current) return;
      // در فیلدهای متنی (مثل جستجوی محصول) باید عادی تایپ شود؛ این شبکهٔ ایمنی فقط
      // برای زمانی است که فوکوس در فیلدهای عددی (تعداد/قیمت) است تا اسکن از دست نرود.
      const tgt = e.target as HTMLElement | null;
      if (tgt instanceof HTMLInputElement && tgt.type !== 'number') return;
      const now = Date.now();
      const fast = now - lastTime <= 50;

      if (e.key === 'Enter') {
        if (buffer.length >= 3) {
          e.preventDefault();
          const code = buffer;
          buffer = '';
          void handleBarcodeApply(code);
        } else {
          buffer = '';
        }
        return;
      }
      if (e.key.length === 1) {
        buffer = fast ? buffer + e.key : e.key;
        // وقتی برخورد سریع کاراکترها مشخص شد، نگذار وارد فیلد فوکوس‌شده (تعداد/قیمت) شوند
        if (buffer.length >= 2 && fast) e.preventDefault();
        lastTime = now;
      }
    };

    // فاز capture تا بتوانیم قبل از رسیدن به input جلوی پیش‌فرض را بگیریم
    document.addEventListener('keydown', onKey, true);
    return () => document.removeEventListener('keydown', onKey, true);
  }, [open, handleBarcodeApply]);

  // هندلر فیلد بارکد اختصاصی
  const handleScanKeyDown = useCallback(
    (e: ReactKeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        const code = scanValue.trim();
        setScanValue('');
        if (code) void handleBarcodeApply(code);
      }
    },
    [scanValue, handleBarcodeApply],
  );

  // زدن Enter روی فیلد تعداد → برگشت فوکوس به فیلد بارکد برای اسکن کالای بعدی
  const handleQtyKeyDown = useCallback((e: ReactKeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      barcodeRef.current?.focus();
      barcodeRef.current?.select?.();
    }
  }, []);

  const handleSubmitAddProduct = async () => {
    if (!restaurantId || !addProductName.trim()) {
      toast.error('نام محصول الزامی است');
      return;
    }
    if (!addProductCategoryId) {
      toast.error('انتخاب دسته‌بندی الزامی است');
      return;
    }
    setAddProductSubmitting(true);
    try {
      const newProduct = await createProductLocal({
        restaurantId,
        name_fa: addProductName.trim(),
        price: Number(normalizePriceInput(addProductSalePrice) || 0),
        category_id: Number(addProductCategoryId),
        barcode: addProductBarcode || undefined,
      });
      await reload();
      const purchasePrice = normalizePriceInput(addProductPurchasePrice) || '0';
      const salePrice = normalizePriceInput(addProductSalePrice);
      const lastIsEmpty =
        items.length > 0 &&
        !items[items.length - 1].rawMaterialId &&
        !items[items.length - 1].menuProductId;
      const targetIdx = lastIsEmpty ? items.length - 1 : items.length;
      setItems((prev) => {
        const filled: DraftItem = {
          ...emptyItem(),
          type: 'final_product',
          menuProductId: String(newProduct.id),
          totalPrice: purchasePrice,
          salePrice,
        };
        // ردیف خالی انتهایی را پر کن، در غیر این صورت یک ردیف جدید اضافه کن (آیتم‌های قبلی حفظ شوند)
        return lastIsEmpty
          ? prev.map((x, i) => (i === prev.length - 1 ? filled : x))
          : [...prev, filled];
      });
      setAddProductOpen(false);
      requestQtyFocus(targetIdx);
    } catch {
      toast.error('خطا در ثبت محصول. لطفاً دوباره تلاش کنید.');
    } finally {
      setAddProductSubmitting(false);
    }
  };

  // ── filter & pagination ───────────────────────────────────────────────────

  const [filterInvoice, setFilterInvoice] = useState('');
  const [filterSupplier, setFilterSupplier] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterDateFrom, setFilterDateFrom] = useState('');
  const [filterDateTo, setFilterDateTo] = useState('');
  const [filterMinAmount, setFilterMinAmount] = useState('');
  const [filterMaxAmount, setFilterMaxAmount] = useState('');
  const [filterSyncStatus, setFilterSyncStatus] = useState('');
  const PAGE_SIZE = 10;
  const [page, setPage] = useState(1);

  const filteredDrafts = useMemo(() => {
    let list = drafts;
    if (filterInvoice.trim()) {
      const q = filterInvoice.trim().toLowerCase();
      list = list.filter((d) => String(d.invoiceNumber).toLowerCase().includes(q));
    }
    if (filterSupplier) {
      list = list.filter((d) => String(d.supplierId) === filterSupplier);
    }
    if (filterStatus) {
      list = list.filter((d) => d.status === filterStatus);
    }
    if (filterSyncStatus) {
      list = list.filter((d) => d.localSyncStatus === filterSyncStatus);
    }
    if (filterDateFrom) {
      list = list.filter((d) => d.purchaseDate && d.purchaseDate >= filterDateFrom);
    }
    if (filterDateTo) {
      list = list.filter((d) => d.purchaseDate && d.purchaseDate <= filterDateTo);
    }
    const minAmt = Number(normalizePriceInput(filterMinAmount) || 0);
    if (minAmt > 0) {
      list = list.filter((d) => (d.totalAmount || 0) >= minAmt);
    }
    const maxAmt = Number(normalizePriceInput(filterMaxAmount) || 0);
    if (maxAmt > 0) {
      list = list.filter((d) => (d.totalAmount || 0) <= maxAmt);
    }
    return list;
  }, [drafts, filterInvoice, filterSupplier, filterStatus, filterSyncStatus, filterDateFrom, filterDateTo, filterMinAmount, filterMaxAmount]);

  const totalPages = Math.max(1, Math.ceil(filteredDrafts.length / PAGE_SIZE));
  const pagedDrafts = useMemo(
    () => filteredDrafts.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE),
    [filteredDrafts, page],
  );

  const hasActiveFilters = !!(filterInvoice || filterSupplier || filterStatus || filterSyncStatus || filterDateFrom || filterDateTo || filterMinAmount || filterMaxAmount);

  const clearFilters = () => {
    setFilterInvoice('');
    setFilterSupplier('');
    setFilterStatus('');
    setFilterSyncStatus('');
    setFilterDateFrom('');
    setFilterDateTo('');
    setFilterMinAmount('');
    setFilterMaxAmount('');
    setPage(1);
  };

  // reset to page 1 whenever filters change
  useEffect(() => { setPage(1); }, [filterInvoice, filterSupplier, filterStatus, filterSyncStatus, filterDateFrom, filterDateTo, filterMinAmount, filterMaxAmount]);

  // ── derived ───────────────────────────────────────────────────────────────

  const hasNoProducts = materials.length === 0 && menuProducts.length === 0;

  // ── render ────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-default-100 p-4 space-y-4" dir="rtl">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <h1 className="text-xl font-bold text-foreground">پیش‌نویس‌های خرید</h1>
          {isSyncing && (
            <span className="inline-flex items-center gap-1 text-xs text-default-400">
              <Spinner size="sm" color="current" />
              همگام‌سازی...
            </span>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="flat" size="sm" onPress={() => navigate('/accounting')}>
            بازگشت
          </Button>
          <Button
            color="warning"
            variant="flat"
            size="sm"
            onPress={async () => {
              if (!restaurantId) return;
              // Reset entity operations (supplier, final_product, etc.) that were
              // incorrectly marked 'synced' with sequence-generated ids by the old bug.
              const entityCount = await resetEntitySyncOperationsToPending(restaurantId);
              // Also reset failed invoice drafts.
              const draftCount = await resetFailedPurchaseDraftsToPending(restaurantId);
              // Force a full pull so web-created entities appear in Electron.
              await resetAccountingPullTimestamp(restaurantId);
              await reload();
              window.dispatchEvent(new Event('focus'));
              toast.success(`همگام‌سازی مجدد: ${entityCount} موجودیت + ${draftCount} پیش‌نویس — در حال ارسال...`);
            }}
          >
            ارسال مجدد و همگام‌سازی کامل
          </Button>
          <Button color="primary" onPress={openCreate}>
            + ثبت پیش‌نویس
          </Button>
        </div>
      </div>

      {/* Filters */}
      {!isLoading && drafts.length > 0 && (
        <Card>
          <CardContent className="py-3 px-4 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm font-semibold text-foreground">فیلتر</span>
              {hasActiveFilters && (
                <Button size="sm" variant="light" color="danger" onPress={clearFilters}>
                  پاک کردن فیلترها
                </Button>
              )}
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
              <Input
                size="sm"
                label="شماره فاکتور"
                placeholder="جستجو..."
                value={filterInvoice}
                onValueChange={setFilterInvoice}
              />
              <Select
                size="sm"
                label="تامین‌کننده"
                selectedKeys={filterSupplier ? [filterSupplier] : []}
                onSelectionChange={(k) => setFilterSupplier(String(Array.from(k)[0] || ''))}
              >
                {suppliers.map((s) => <SelectItem key={String(s.id)}>{s.name}</SelectItem>)}
              </Select>
              <Select
                size="sm"
                label="وضعیت فاکتور"
                selectedKeys={filterStatus ? [filterStatus] : []}
                onSelectionChange={(k) => setFilterStatus(String(Array.from(k)[0] || ''))}
              >
                <SelectItem key="draft">پیش‌نویس</SelectItem>
                <SelectItem key="pending_approval">در انتظار تایید</SelectItem>
                <SelectItem key="approved">تایید شده</SelectItem>
                <SelectItem key="rejected">رد شده</SelectItem>
              </Select>
              <Select
                size="sm"
                label="وضعیت سینک"
                selectedKeys={filterSyncStatus ? [filterSyncStatus] : []}
                onSelectionChange={(k) => setFilterSyncStatus(String(Array.from(k)[0] || ''))}
              >
                <SelectItem key="pending">در صف ارسال</SelectItem>
                <SelectItem key="syncing">در حال ارسال</SelectItem>
                <SelectItem key="synced">سینک شده</SelectItem>
                <SelectItem key="failed">ارسال ناموفق</SelectItem>
              </Select>
              <ShamsiDatePicker
                size="sm"
                label="از تاریخ"
                value={filterDateFrom}
                onChange={setFilterDateFrom}
              />
              <ShamsiDatePicker
                size="sm"
                label="تا تاریخ"
                value={filterDateTo}
                onChange={setFilterDateTo}
              />
              <Input
                size="sm"
                label="حداقل مبلغ"
                placeholder="ریال"
                inputMode="numeric"
                value={formatPriceInput(filterMinAmount)}
                onValueChange={(v) => setFilterMinAmount(normalizePriceInput(v))}
              />
              <Input
                size="sm"
                label="حداکثر مبلغ"
                placeholder="ریال"
                inputMode="numeric"
                value={formatPriceInput(filterMaxAmount)}
                onValueChange={(v) => setFilterMaxAmount(normalizePriceInput(v))}
              />
            </div>
            {hasActiveFilters && (
              <p className="text-xs text-default-400">
                {filteredDrafts.length} نتیجه از {drafts.length} فاکتور
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {/* Draft list */}
      {isLoading ? (
        <div className="flex flex-col gap-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="rounded-xl bg-default-200 h-20 animate-pulse" />
          ))}
        </div>
      ) : drafts.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 gap-3">
            <div className="w-14 h-14 rounded-full bg-default-200 flex items-center justify-center">
              <svg className="w-7 h-7 text-default-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                  d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </div>
            <p className="text-default-500 text-sm">هیچ پیش‌نویس خریدی ثبت نشده است</p>
            <Button color="primary" onPress={openCreate}>ثبت اولین پیش‌نویس</Button>
          </CardContent>
        </Card>
      ) : filteredDrafts.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12 gap-3">
            <p className="text-default-500 text-sm">هیچ فاکتوری با این فیلترها یافت نشد</p>
            <Button size="sm" variant="flat" onPress={clearFilters}>پاک کردن فیلترها</Button>
          </CardContent>
        </Card>
      ) : (
        <div className="flex flex-col gap-3">
          {pagedDrafts.map((d) => {
            const syncCfg = SYNC_STATUS_CONFIG[d.localSyncStatus] ?? SYNC_STATUS_CONFIG.pending;
            const invCfg = INVOICE_STATUS_CONFIG[d.status] ?? INVOICE_STATUS_CONFIG.pending_approval;
            const isServerSynced = d.localSyncStatus === 'synced';
            const canApproveReject = isServerSynced && d.status === 'pending_approval' && token;
            const serverInvoiceId = d.serverInvoiceId ?? (isServerSynced ? d.id : null);
            const supplierName = d.supplierName
              || suppliers.find((s) => s.id === d.supplierId)?.name
              || '—';
            return (
              <Card key={d.id} className="transition-shadow duration-200 hover:shadow-md cursor-default">
                <CardContent className="py-3 px-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex flex-col gap-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-foreground">فاکتور #{d.invoiceNumber}</span>
                        <Chip color={invCfg.color as any} size="sm" variant="soft">
                          <Chip.Label>{invCfg.label}</Chip.Label>
                        </Chip>
                        {!isServerSynced && (
                          <Chip color={syncCfg.color} size="sm" variant="flat">
                            <Chip.Label>{syncCfg.label}</Chip.Label>
                          </Chip>
                        )}
                      </div>
                      <div className="flex items-center gap-3 text-xs text-default-500 flex-wrap">
                        <span>{supplierName}</span>
                        {d.purchaseDate && <span>{toJalali(d.purchaseDate)}</span>}
                        {d.totalAmount > 0 && (
                          <span className="text-foreground font-medium">{formatCurrency(d.totalAmount)}</span>
                        )}
                      </div>
                      {d.syncError && (
                        <p className="text-danger text-xs mt-0.5 truncate">{d.syncError}</p>
                      )}
                    </div>
                    <div className="flex gap-1 shrink-0 flex-wrap">
                      {isServerSynced && d.status === 'approved' && (
                        <Button
                          size="sm"
                          color="warning"
                          variant="flat"
                          onPress={() =>
                            navigate('/accounting/purchase-returns', {
                              state: { invoiceId: serverInvoiceId ?? d.id },
                            })
                          }
                        >
                          برگشت از خرید
                        </Button>
                      )}
                      {canApproveReject && serverInvoiceId && (
                        <>
                          <Button
                            size="sm"
                            color="success"
                            variant="flat"
                            onPress={async () => {
                              if (!restaurantId) return;
                              try {
                                await updateAccountingPurchaseInvoiceStatus(
                                  Number(serverInvoiceId),
                                  { restaurantId, status: 'approved' },
                                  token!,
                                );
                                await accountingDb.purchaseInvoices.update(d.id, { status: 'approved' });
                                await reload();
                                toast.success('فاکتور تایید شد');
                              } catch { toast.error('خطا در تایید فاکتور'); }
                            }}
                          >تایید</Button>
                          <Button
                            size="sm"
                            color="danger"
                            variant="flat"
                            onPress={async () => {
                              if (!restaurantId) return;
                              try {
                                await updateAccountingPurchaseInvoiceStatus(
                                  Number(serverInvoiceId),
                                  { restaurantId, status: 'rejected' },
                                  token!,
                                );
                                await accountingDb.purchaseInvoices.update(d.id, { status: 'rejected' });
                                await reload();
                                toast.success('فاکتور رد شد');
                              } catch { toast.error('خطا در رد فاکتور'); }
                            }}
                          >رد</Button>
                        </>
                      )}
                      {(d.status === 'pending_approval' || d.status === 'draft') && (
                        <Button
                          size="sm"
                          variant="flat"
                          onPress={() => loadInvoiceIntoModal(d, false)}
                        >
                          ویرایش
                        </Button>
                      )}
                      {(d.status === 'approved' || d.status === 'rejected') && (
                        <Button
                          size="sm"
                          variant="flat"
                          onPress={() => loadInvoiceIntoModal(d, true)}
                        >
                          مشاهده
                        </Button>
                      )}
                      {!isServerSynced && (
                      <Button
                        size="sm"
                        color="danger"
                        variant="light"
                        onPress={async () => {
                          await deletePurchaseInvoiceDraftLocal(d.id);
                          await reload();
                          toast.success('پیش‌نویس حذف شد');
                        }}
                      >
                        حذف
                      </Button>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between gap-2 pt-1">
              <span className="text-xs text-default-400">
                صفحه {page} از {totalPages} — {filteredDrafts.length} فاکتور
              </span>
              <div className="flex items-center gap-1">
                <Button
                  size="sm"
                  variant="flat"
                  isDisabled={page === 1}
                  onPress={() => setPage((p) => Math.max(1, p - 1))}
                >
                  قبلی
                </Button>
                {Array.from({ length: totalPages }, (_, i) => i + 1)
                  .filter((p) => p === 1 || p === totalPages || Math.abs(p - page) <= 1)
                  .reduce<(number | '…')[]>((acc, p, idx, arr) => {
                    if (idx > 0 && typeof arr[idx - 1] === 'number' && (p as number) - (arr[idx - 1] as number) > 1) acc.push('…');
                    acc.push(p);
                    return acc;
                  }, [])
                  .map((p, i) =>
                    p === '…' ? (
                      <span key={`ellipsis-${i}`} className="px-1 text-default-400 text-sm">…</span>
                    ) : (
                      <Button
                        key={p}
                        size="sm"
                        variant={p === page ? 'solid' : 'flat'}
                        color={p === page ? 'primary' : 'default'}
                        onPress={() => setPage(p as number)}
                      >
                        {p}
                      </Button>
                    ),
                  )}
                <Button
                  size="sm"
                  variant="flat"
                  isDisabled={page === totalPages}
                  onPress={() => setPage((p) => Math.min(totalPages, p + 1))}
                >
                  بعدی
                </Button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Create / Edit / View Modal */}
      <Modal isOpen={open} onOpenChange={setOpen}>
        <ModalShell size="full">
          <ModalHeader>
            {isViewMode ? 'مشاهده فاکتور خرید' : editingId ? 'ویرایش پیش‌نویس خرید' : 'ثبت پیش‌نویس خرید'}
          </ModalHeader>
          <ModalBody className="gap-4">

            {/* Basic info */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              <Input
                label="شماره فاکتور"
                value={invoiceNumber}
                onValueChange={setInvoiceNumber}
                isRequired
                isReadOnly={isViewMode}
              />
              {isViewMode ? (
                <Input
                  label="تامین‌کننده"
                  value={suppliers.find((s) => String(s.id) === supplierId)?.name || supplierId || '—'}
                  isReadOnly
                />
              ) : (
                <ItemPicker
                  options={suppliers.map((s) => ({ id: String(s.id), label: s.name }))}
                  value={supplierId || null}
                  label="تامین‌کننده"
                  placeholder="جستجوی تامین‌کننده..."
                  onChange={setSupplierId}
                />
              )}
              <ShamsiDatePicker
                label="تاریخ فاکتور"
                value={purchaseDate}
                onChange={isViewMode ? () => {} : setPurchaseDate}
                isRequired
              />
            </div>

            {/* Barcode scan bar — فقط در حالت ویرایش/ثبت */}
            {!isViewMode && <div className="rounded-2xl border-2 border-primary-200 bg-primary-50/60 p-3 sm:p-4">
              <Input
                ref={barcodeRef}
                autoFocus
                value={scanValue}
                onValueChange={setScanValue}
                onKeyDown={handleScanKeyDown}
                placeholder="بارکد کالا را اسکن کنید یا تایپ و Enter بزنید…"
                className="[&]:text-lg [&]:font-semibold [&]:tracking-wider"
                startContent={
                  <svg className="w-6 h-6 text-primary-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                      d="M4 5v14M8 5v14M12 5v14M16 5v10M20 5v14M16 17h0M16 19h0" />
                  </svg>
                }
                endContent={
                  <span className="hidden sm:inline text-primary-400 text-xs whitespace-nowrap">اسکن → افزودن خودکار</span>
                }
              />
              <p className="mt-2 text-xs text-primary-600/80">
                با اسکن، کالا خودکار اضافه می‌شود و فوکوس روی «تعداد» می‌رود؛ بعد از وارد کردن تعداد، Enter بزنید تا به اسکن بعدی برگردید.
              </p>
            </div>}

            {/* Items */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold text-foreground">آیتم‌های خرید</span>
                <span className="text-xs text-default-400">{items.length} آیتم</span>
              </div>

              {items.length === 0 && !hasNoProducts && (
                <div className="rounded-xl border border-dashed border-default-300 bg-default-50 py-10 px-4 text-center space-y-1">
                  <svg className="w-10 h-10 mx-auto text-default-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                      d="M4 5v14M8 5v14M12 5v14M16 5v10M20 5v14" />
                  </svg>
                  <p className="text-default-500 text-sm font-medium">برای شروع، اولین کالا را اسکن کنید</p>
                  <p className="text-default-400 text-xs">یا با دکمهٔ پایین به‌صورت دستی آیتم اضافه کنید</p>
                </div>
              )}

              {hasNoProducts && (
                <div className="rounded-xl border border-warning-200 bg-warning-50 p-3 text-center space-y-1">
                  <p className="text-warning-700 text-sm font-medium">هیچ ماده اولیه یا محصولی یافت نشد</p>
                  <p className="text-warning-600 text-xs">
                    مطمئن شوید که محصولات منو با سرور همگام‌سازی شده‌اند، یا از بارکد برای افزودن ماده اولیه استفاده کنید.
                  </p>
                </div>
              )}

              {items.map((line, idx) => {
                const isFinalProduct = line.type === 'final_product';
                const lineTotal = Number(normalizePriceInput(line.totalPrice) || 0);
                const lineQty = Number(line.quantity || 0);
                const unitPriceForLine = lineQty > 0 ? lineTotal / lineQty : 0;
                const activeOptions = isFinalProduct ? menuProductOptions : materialOptions;
                const selectedKey = isFinalProduct ? line.menuProductId : line.rawMaterialId;

                return (
                  <div
                    key={idx}
                    className={`rounded-xl p-3 space-y-2 border transition-colors duration-500 ${
                      flashIdx === idx
                        ? 'bg-primary-50 border-primary-300 ring-2 ring-primary-200'
                        : 'bg-default-100 border-default-200'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-default-400">آیتم {idx + 1}</span>
                      {lineTotal > 0 && (
                        <span className="text-xs text-foreground font-medium">{formatCurrency(lineTotal)}</span>
                      )}
                    </div>

                    {/* Type toggle */}
                    <Tabs
                      className="w-full"
                      selectedKey={isFinalProduct ? 'final_product' : 'raw_material'}
                      onSelectionChange={(k) => {
                        if (isViewMode) return;
                        k === 'final_product'
                          ? updateItem(idx, { type: 'final_product', rawMaterialId: '' })
                          : updateItem(idx, { type: 'raw_material', menuProductId: '', finalProductId: '' });
                      }}
                      aria-label="نوع آیتم فاکتور"
                    >
                      <Tabs.ListContainer className="w-full">
                        <Tabs.List
                          aria-label="نوع آیتم فاکتور"
                          className="w-full *:flex-1 *:justify-center"
                        >
                          <Tabs.Tab id="raw_material">
                            ماده اولیه
                            <Tabs.Indicator />
                          </Tabs.Tab>
                          <Tabs.Tab id="final_product">
                            محصول رستوران
                            <Tabs.Indicator />
                          </Tabs.Tab>
                        </Tabs.List>
                      </Tabs.ListContainer>
                    </Tabs>

                    {/* Product/material selector */}
                    {isViewMode ? (
                      <Input
                        label={isFinalProduct ? 'محصول رستوران' : 'ماده اولیه'}
                        value={
                          isFinalProduct
                            ? (menuProducts.find((p) => String(p.id) === selectedKey)?.name_fa
                               || menuProducts.find((p) => String(p.id) === selectedKey)?.name
                               || selectedKey || '—')
                            : (materials.find((m) => String(m.id) === selectedKey)?.name || selectedKey || '—')
                        }
                        isReadOnly
                      />
                    ) : activeOptions.length === 0 ? (
                      <p className="text-xs text-default-400 py-1">
                        {isFinalProduct
                          ? 'هیچ محصولی یافت نشد — مطمئن شوید محصولات منو همگام‌سازی شده‌اند'
                          : 'هیچ ماده اولیه‌ای ثبت نشده'}
                      </p>
                    ) : (
                      <ItemPicker
                        options={activeOptions}
                        value={selectedKey || null}
                        label={isFinalProduct ? 'محصول رستوران' : 'ماده اولیه'}
                        placeholder={`انتخاب ${isFinalProduct ? 'محصول' : 'ماده اولیه'}...`}
                        onChange={(val) => {
                          if (isFinalProduct) {
                            const prod = menuProducts.find((p) => String(p.id) === val);
                            const autoSalePrice =
                              prod?.price != null && prod.price > 0 ? String(prod.price) : '';
                            updateItem(idx, { menuProductId: val, finalProductId: '', salePrice: autoSalePrice });
                          } else {
                            updateItem(idx, { rawMaterialId: val });
                          }
                        }}
                      />
                    )}

                    <div className="grid grid-cols-3 gap-2">
                      <Input
                        ref={(el) => { qtyRefs.current[idx] = el; }}
                        type="number"
                        label="مقدار"
                        value={line.quantity}
                        onValueChange={(v) => updateItem(idx, { quantity: v })}
                        onKeyDown={handleQtyKeyDown}
                        isReadOnly={isViewMode}
                      />
                      <Input
                        type="text"
                        inputMode="numeric"
                        label="قیمت کل خرید"
                        value={formatPriceInput(line.totalPrice)}
                        onValueChange={(v) => updateItem(idx, { totalPrice: normalizePriceInput(v) })}
                        endContent={
                          <span className="text-default-400 text-xs whitespace-nowrap">ریال</span>
                        }
                        isReadOnly={isViewMode}
                      />
                      <Input
                        type="text"
                        inputMode="numeric"
                        label="قیمت فروش"
                        placeholder="اختیاری"
                        value={formatPriceInput(line.salePrice)}
                        onValueChange={(v) => updateItem(idx, { salePrice: normalizePriceInput(v) })}
                        endContent={
                          <span className="text-default-400 text-xs whitespace-nowrap">ریال</span>
                        }
                        isReadOnly={isViewMode}
                      />
                    </div>

                    {unitPriceForLine > 0 && lineQty > 0 && (
                      <p className="text-xs text-default-400">
                        قیمت تکی (محاسبه‌شده): {formatCurrency(unitPriceForLine)}
                      </p>
                    )}

                    {!isViewMode && (
                    <Button
                      size="sm"
                      color="danger"
                      variant="light"
                      onPress={() => setItems((prev) => prev.filter((_, i) => i !== idx))}
                    >
                      حذف آیتم
                    </Button>
                    )}
                  </div>
                );
              })}

              {!isViewMode && (
              <Button
                variant="flat"
                size="sm"
                className="w-full"
                onPress={() => setItems((prev) => [...prev, emptyItem()])}
              >
                + افزودن آیتم
              </Button>
              )}
            </div>

            {/* Extra costs + total */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Input
                type="text"
                inputMode="numeric"
                label="هزینه جانبی"
                value={formatPriceInput(extraCosts)}
                onValueChange={(v) => setExtraCosts(normalizePriceInput(v))}
                endContent={
                  <span className="text-default-400 text-sm whitespace-nowrap">ریال</span>
                }
                isReadOnly={isViewMode}
              />
              <div className="flex items-center justify-between rounded-xl bg-default-200 px-4 py-3">
                <span className="text-sm text-default-600">جمع کل:</span>
                <span className="font-bold text-foreground text-lg">{formatCurrency(runningTotal)}</span>
              </div>
            </div>
          </ModalBody>
          <ModalFooter>
            <Button variant="flat" onPress={() => setOpen(false)}>
              {isViewMode ? 'بستن' : 'انصراف'}
            </Button>
            {!isViewMode && (
            <Button color="primary" isLoading={isSaving} onPress={handleSave}>
              {editingId ? 'ذخیره تغییرات' : 'ثبت پیش‌نویس'}
            </Button>
            )}
          </ModalFooter>
        </ModalShell>
      </Modal>

      {/* Add product modal — وقتی بارکد یافت نشود باز می‌شود */}
      <Modal isOpen={addProductOpen} onOpenChange={setAddProductOpen} size="lg">
        <ModalShell>
          <ModalHeader>افزودن محصول جدید</ModalHeader>
          <ModalBody className="gap-3">
            {isCheckingMasterProduct && (
              <div className="flex items-center justify-center gap-2 text-default-500 text-sm py-2">
                <Spinner size="sm" />
                <span>در حال جستجو در محصولات پایه...</span>
              </div>
            )}
            <Input label="بارکد" value={addProductBarcode} isReadOnly />
            <Input
              label="نام محصول"
              value={addProductName}
              onValueChange={setAddProductName}
              isDisabled={isCheckingMasterProduct}
              isRequired
            />
            {categories.length === 0 ? (
              <p className="text-warning-600 text-xs">
                هیچ دسته‌بندی‌ای یافت نشد — ابتدا از بخش محصولات یک دسته‌بندی بسازید یا با سرور همگام‌سازی کنید.
              </p>
            ) : (
              <Select
                label="دسته‌بندی"
                selectedKeys={addProductCategoryId ? [addProductCategoryId] : []}
                onSelectionChange={(k) => setAddProductCategoryId(String(Array.from(k)[0] || ''))}
                isDisabled={isCheckingMasterProduct}
              >
                {categories.map((c) => (
                  <SelectItem key={String(c.id)}>{c.name_fa || c.name}</SelectItem>
                ))}
              </Select>
            )}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Input
                type="text"
                inputMode="numeric"
                label="قیمت خرید (برای این فاکتور)"
                value={formatPriceInput(addProductPurchasePrice)}
                onValueChange={(v) => setAddProductPurchasePrice(normalizePriceInput(v))}
                isDisabled={isCheckingMasterProduct}
                endContent={
                  <span className="text-default-400 text-sm whitespace-nowrap">ریال</span>
                }
              />
              <Input
                type="text"
                inputMode="numeric"
                label="قیمت فروش"
                value={formatPriceInput(addProductSalePrice)}
                onValueChange={(v) => setAddProductSalePrice(normalizePriceInput(v))}
                isDisabled={isCheckingMasterProduct}
                endContent={
                  <span className="text-default-400 text-sm whitespace-nowrap">ریال</span>
                }
              />
            </div>
          </ModalBody>
          <ModalFooter>
            <Button variant="flat" onPress={() => setAddProductOpen(false)}>انصراف</Button>
            <Button
              color="primary"
              isLoading={addProductSubmitting}
              isDisabled={isCheckingMasterProduct || categories.length === 0}
              onPress={handleSubmitAddProduct}
            >
              ثبت محصول
            </Button>
          </ModalFooter>
        </ModalShell>
      </Modal>
    </div>
  );
}
