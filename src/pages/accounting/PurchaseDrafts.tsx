import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../../store/authStore';
import { useSyncStore } from '../../store/syncStore';
import {
  accountingDb,
  createPurchaseInvoiceLocal,
  getDefaultWarehouseLocal,
  getOrCreateFinalProductByProductId,
  getPurchaseInvoiceItemsByInvoiceId,
  resetAccountingPullTimestamp,
  updatePurchaseInvoiceDraftLocal,
} from '../../services/accountingLocalDb';
import {
  createProductLocal,
  getLocalCategories,
  getLocalProducts,
} from '../../services/catalogLocalDb';
import { editApprovedPurchaseInvoice, getMasterProductByBarcode } from '../../services/api';
import { toast } from '../../utils/toast';
import {
  emptyItem,
  normalizeBarcode,
  normalizePriceInput,
  type DraftItem,
  type ItemType,
} from './purchaseDrafts/shared';
import { PurchaseInvoiceModal } from './purchaseDrafts/PurchaseInvoiceModal';
import { AddProductModal } from './purchaseDrafts/AddProductModal';
import { PurchaseDraftFilters } from './purchaseDrafts/PurchaseDraftFilters';
import { PurchaseDraftsHeader } from './purchaseDrafts/PurchaseDraftsHeader';
import { PurchaseDraftList } from './purchaseDrafts/PurchaseDraftList';

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
  /** true وقتی editingId شناسه سرور یک فاکتور APPROVED است — ذخیره باید سرور را
   *  مستقیم صدا بزند (نه صف آفلاین)، چون سرور فاکتور اصلی را برگشت کامل و
   *  فاکتور جدید تاییدشده صادر می‌کند. */
  const [isEditingApprovedInvoice, setIsEditingApprovedInvoice] = useState(false);
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
    // از Promise.allSettled به‌جای Promise.all استفاده می‌کنیم: اگر یکی از کوئری‌های
    // فرعی (مثلاً محصولات/دسته‌بندی‌ها) خطا بدهد، نباید لیست فاکتورهای خرید
    // (که مهم‌ترین بخش این صفحه است) آپدیت‌نشده باقی بماند — قبلاً با Promise.all
    // یک reject در هر کدام، setDrafts را اصلاً اجرا نمی‌کرد و فاکتور تازه‌ثبت‌شده
    // (که در Dexie واقعاً ذخیره شده بود) در لیست ظاهر نمی‌شد.
    const [s, m, afp, d, mp, cats] = await Promise.allSettled([
      accountingDb.suppliers.where('restaurantId').equals(restaurantId).reverse().sortBy('id'),
      accountingDb.rawMaterials.where('restaurantId').equals(restaurantId).reverse().sortBy('id'),
      accountingDb.finalProducts.where('restaurantId').equals(restaurantId).toArray(),
      accountingDb.purchaseInvoices
        .where('restaurantId')
        .equals(restaurantId)
        .reverse()
        .sortBy('id'),
      getLocalProducts(restaurantId).then((r) =>
        // محصولات تازه‌ساخته‌شدهٔ آفلاین (pending_create) هم باید قابل انتخاب/ذخیره باشند
        r.data.filter((p) => p._syncStatus === 'synced' || p._syncStatus === 'pending_create'),
      ),
      getLocalCategories(restaurantId),
    ]);
    const unwrap = <T,>(r: PromiseSettledResult<T>, label: string, fallback: T): T => {
      if (r.status === 'fulfilled') return r.value;
      console.error(`[PurchaseDrafts] reload: ${label} failed`, r.reason);
      return fallback;
    };
    setSuppliers((prev) => unwrap(s, 'suppliers', prev));
    setMaterials((prev) => unwrap(m, 'rawMaterials', prev));
    setAccountingFinalProducts((prev) => unwrap(afp, 'finalProducts', prev));
    setDrafts((prev) => unwrap(d, 'purchaseInvoices', prev));
    setMenuProducts((prev) => unwrap(mp, 'menuProducts', prev));
    setCategories((prev) => unwrap(cats, 'categories', prev));
    setIsLoading(false);
  }, [restaurantId]);

  useEffect(() => {
    void reload();
  }, [reload]);

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

  const hasValidItems = useMemo(
    () =>
      items.some((x) => {
        const qty = Number(x.quantity || 0);
        if (qty <= 0) return false;
        return x.type === 'final_product' ? !!x.menuProductId : !!x.rawMaterialId;
      }),
    [items],
  );

  // ── helpers ───────────────────────────────────────────────────────────────

  const updateItem = (idx: number, patch: Partial<DraftItem>) =>
    setItems((prev) => prev.map((x, i) => (i === idx ? { ...x, ...patch } : x)));

  const openCreate = () => {
    setEditingId(null);
    setIsViewMode(false);
    setIsEditingApprovedInvoice(false);
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
    setIsEditingApprovedInvoice(false);
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
          // quantity در دیتابیس decimal است و ممکن است "1.000" بیاید؛
          // تبدیل به عدد صفرهای اضافی را حذف می‌کند (۱.۰۰۰ → ۱، ۱.۵۰۰ → ۱.۵).
          quantity: String(Number(x.quantity) || 0),
          totalPrice: String(Number(x.unitPrice || 0) * Number(x.quantity || 0)),
          salePrice: x.salePrice != null ? String(x.salePrice) : '',
        };
      }),
    );
    setScanValue('');
    setOpen(true);
  };

  /**
   * Opens the modal to edit an APPROVED, server-synced invoice. Reuses
   * loadInvoiceIntoModal to populate fields/items from the local mirror,
   * then overrides editingId to the *server* invoice id (which handleSave
   * needs for the online-only edit call) and flags the approved-edit path.
   */
  const openApprovedEdit = async (d: any, serverInvoiceId: number) => {
    await loadInvoiceIntoModal(d, false);
    setEditingId(serverInvoiceId);
    setIsEditingApprovedInvoice(true);
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

    if (isEditingApprovedInvoice && !token) {
      toast.error('برای ویرایش فاکتور تاییدشده باید آنلاین و وارد حساب باشید.');
      return;
    }

    setIsSaving(true);
    try {
      const defaultWarehouse = await getDefaultWarehouseLocal(restaurantId);
      const defaultWarehouseId = defaultWarehouse?.id as number | undefined;
      const linesWithWarehouse = lines.map((x) => ({ ...x, warehouseId: defaultWarehouseId }));

      if (isEditingApprovedInvoice && editingId) {
        // آنلاین-فقط: سرور فاکتور اصلی را برگشت کامل می‌زند و فاکتور جدید
        // تاییدشده صادر می‌کند — هرگز از صف آفلاین رد نمی‌شود.
        await editApprovedPurchaseInvoice(
          editingId,
          {
            restaurantId,
            supplierId: Number(supplierId),
            invoiceNumber: invoiceNumber.trim(),
            purchaseDate,
            items: linesWithWarehouse,
            extraCosts: Number(normalizePriceInput(extraCosts) || 0),
          },
          token!,
        );
        // مبدأ حقیقت اکنون سرور است: mirror محلی را با یک full-pull فوری همگام کن
        // (همان الگوی دکمه «ارسال مجدد و همگام‌سازی کامل» بالای همین صفحه).
        await resetAccountingPullTimestamp(restaurantId);
        window.dispatchEvent(new Event('focus'));
        toast.success('فاکتور ویرایش شد؛ فاکتور جدید صادر شد.');
      } else if (editingId) {
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
    } catch (err: any) {
      // برای ویرایش تاییدشده، اینترسپتور axios پیام دقیق سرور (مثلاً «فاکتوری
      // که پرداخت دارد قابل ویرایش نیست») را قبلاً به‌صورت toast نشان داده؛
      // اینجا فقط برای مسیر محلی toast عمومی نشان می‌دهیم تا تکراری نشود.
      if (!isEditingApprovedInvoice || !err?.response) {
        toast.error('خطا در ذخیره‌سازی. لطفاً دوباره تلاش کنید.');
      }
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
            i === existingIdx ? { ...x, quantity: String(Number(x.quantity || 1) + 1) } : x,
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

  const handleBarcodeApply = useCallback(
    async (code: string) => {
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
          () => ({
            ...emptyItem(),
            type: 'final_product',
            menuProductId: String(matchedProduct.id),
          }),
        );
        return;
      }

      // ۳) یافت نشد → مودال افزودن «محصول» جدید
      setAddProductBarcode(c);
      setAddProductName('');
      setAddProductCategoryId(
        String(
          categories.find((cat) => cat._syncStatus === 'synced')?.id || categories[0]?.id || '',
        ),
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
    },
    [materials, menuProducts, categories, token, addOrIncrementRow],
  );

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
  }, [
    drafts,
    filterInvoice,
    filterSupplier,
    filterStatus,
    filterSyncStatus,
    filterDateFrom,
    filterDateTo,
    filterMinAmount,
    filterMaxAmount,
  ]);

  const totalPages = Math.max(1, Math.ceil(filteredDrafts.length / PAGE_SIZE));
  const pagedDrafts = useMemo(
    () => filteredDrafts.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE),
    [filteredDrafts, page],
  );

  const hasActiveFilters = !!(
    filterInvoice ||
    filterSupplier ||
    filterStatus ||
    filterSyncStatus ||
    filterDateFrom ||
    filterDateTo ||
    filterMinAmount ||
    filterMaxAmount
  );

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
  useEffect(() => {
    setPage(1);
  }, [
    filterInvoice,
    filterSupplier,
    filterStatus,
    filterSyncStatus,
    filterDateFrom,
    filterDateTo,
    filterMinAmount,
    filterMaxAmount,
  ]);

  // ── derived ───────────────────────────────────────────────────────────────

  const hasNoProducts = materials.length === 0 && menuProducts.length === 0;

  // ── render ────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-background p-4 space-y-4" dir="rtl">
      {/* Header */}
      <PurchaseDraftsHeader
        isSyncing={isSyncing}
        navigate={navigate}
        restaurantId={restaurantId}
        reload={reload}
        openCreate={openCreate}
      />

      {/* Filters */}
      {!isLoading && drafts.length > 0 && (
        <PurchaseDraftFilters
          hasActiveFilters={hasActiveFilters}
          clearFilters={clearFilters}
          filterInvoice={filterInvoice}
          setFilterInvoice={setFilterInvoice}
          filterSupplier={filterSupplier}
          setFilterSupplier={setFilterSupplier}
          filterStatus={filterStatus}
          setFilterStatus={setFilterStatus}
          filterSyncStatus={filterSyncStatus}
          setFilterSyncStatus={setFilterSyncStatus}
          filterDateFrom={filterDateFrom}
          setFilterDateFrom={setFilterDateFrom}
          filterDateTo={filterDateTo}
          setFilterDateTo={setFilterDateTo}
          filterMinAmount={filterMinAmount}
          setFilterMinAmount={setFilterMinAmount}
          filterMaxAmount={filterMaxAmount}
          setFilterMaxAmount={setFilterMaxAmount}
          suppliers={suppliers}
          filteredDrafts={filteredDrafts}
          drafts={drafts}
        />
      )}

      {/* Draft list */}
      <PurchaseDraftList
        isLoading={isLoading}
        drafts={drafts}
        filteredDrafts={filteredDrafts}
        pagedDrafts={pagedDrafts}
        suppliers={suppliers}
        token={token}
        restaurantId={restaurantId}
        navigate={navigate}
        reload={reload}
        openCreate={openCreate}
        clearFilters={clearFilters}
        loadInvoiceIntoModal={loadInvoiceIntoModal}
        openApprovedEdit={openApprovedEdit}
        page={page}
        setPage={setPage}
        totalPages={totalPages}
      />

      {/* Create / Edit / View Modal */}
      <PurchaseInvoiceModal
        open={open}
        setOpen={setOpen}
        isViewMode={isViewMode}
        editingId={editingId}
        isEditingApprovedInvoice={isEditingApprovedInvoice}
        items={items}
        setItems={setItems}
        runningTotal={runningTotal}
        barcodeRef={barcodeRef}
        scanValue={scanValue}
        setScanValue={setScanValue}
        handleScanKeyDown={handleScanKeyDown}
        invoiceNumber={invoiceNumber}
        setInvoiceNumber={setInvoiceNumber}
        suppliers={suppliers}
        supplierId={supplierId}
        setSupplierId={setSupplierId}
        purchaseDate={purchaseDate}
        setPurchaseDate={setPurchaseDate}
        hasNoProducts={hasNoProducts}
        flashIdx={flashIdx}
        menuProductOptions={menuProductOptions}
        materialOptions={materialOptions}
        accountingFinalProducts={accountingFinalProducts}
        menuProducts={menuProducts}
        materials={materials}
        updateItem={updateItem}
        qtyRefs={qtyRefs}
        handleQtyKeyDown={handleQtyKeyDown}
        extraCosts={extraCosts}
        setExtraCosts={setExtraCosts}
        isSaving={isSaving}
        hasValidItems={hasValidItems}
        handleSave={handleSave}
      />

      {/* Add product modal — وقتی بارکد یافت نشود باز می‌شود */}
      <AddProductModal
        addProductOpen={addProductOpen}
        setAddProductOpen={setAddProductOpen}
        isCheckingMasterProduct={isCheckingMasterProduct}
        addProductBarcode={addProductBarcode}
        addProductName={addProductName}
        setAddProductName={setAddProductName}
        categories={categories}
        addProductCategoryId={addProductCategoryId}
        setAddProductCategoryId={setAddProductCategoryId}
        addProductPurchasePrice={addProductPurchasePrice}
        setAddProductPurchasePrice={setAddProductPurchasePrice}
        addProductSalePrice={addProductSalePrice}
        setAddProductSalePrice={setAddProductSalePrice}
        addProductSubmitting={addProductSubmitting}
        handleSubmitAddProduct={handleSubmitAddProduct}
      />
    </div>
  );
}
