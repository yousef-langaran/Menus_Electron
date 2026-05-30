import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toShamsiDate } from '../../utils/date';
import { Autocomplete, Card, CardContent, Chip, EmptyState, Label, ListBox, Modal, ModalBody, ModalFooter, ModalHeader, SearchField, Spinner, Tabs, useFilter } from '@heroui/react';
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
  createRawMaterialLocal,
  deletePurchaseInvoiceDraftLocal,
  getDefaultWarehouseLocal,
  getOrCreateFinalProductByProductId,
  getPurchaseInvoiceItemsByInvoiceId,
  resetAccountingPullTimestamp,
  resetEntitySyncOperationsToPending,
  resetFailedPurchaseDraftsToPending,
  updatePurchaseInvoiceDraftLocal,
} from '../../services/accountingLocalDb';
import { getLocalProducts } from '../../services/catalogLocalDb';
import { getMasterProductByBarcode, updateAccountingPurchaseInvoiceStatus } from '../../services/api';
import { toast } from '../../utils/toast';

const RAW_MATERIAL_UNITS = ['gram', 'kilogram', 'liter', 'milliliter', 'piece', 'pack'];
const UNIT_LABELS: Record<string, string> = {
  gram: 'گرم',
  kilogram: 'کیلوگرم',
  liter: 'لیتر',
  milliliter: 'میلی‌لیتر',
  piece: 'عدد',
  pack: 'بسته',
};

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

const formatPriceInput = (value: string) => {
  const digits = normalizePriceInput(value);
  if (!digits) return '';
  return new Intl.NumberFormat('en-US').format(Number(digits));
};

const formatCurrency = (n: number) =>
  new Intl.NumberFormat('fa-IR').format(Math.round(n)) + ' تومان';

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
  /** قیمت خرید */
  unitPrice: string;
  /** قیمت فروش (اختیاری) */
  salePrice: string;
};

const emptyItem = (): DraftItem => ({
  type: 'raw_material',
  rawMaterialId: '',
  menuProductId: '',
  finalProductId: '',
  quantity: '1',
  unitPrice: '0',
  salePrice: '',
});

export default function AccountingPurchaseDraftsPage() {
  const navigate = useNavigate();
  const { user, token } = useAuthStore((s) => ({ user: s.user, token: s.token }));
  const restaurantId = user?.restaurants?.[0]?.id;

  const lastSyncedAt = useSyncStore((s) => s.lastSyncedAt);
  const isSyncing = useSyncStore((s) => s.isSyncing);

  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [materials, setMaterials] = useState<any[]>([]);
  const [menuProducts, setMenuProducts] = useState<any[]>([]);
  /** accounting finalProducts — used only to resolve IDs when loading saved items */
  const [accountingFinalProducts, setAccountingFinalProducts] = useState<any[]>([]);
  const [drafts, setDrafts] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Form state
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [invoiceNumber, setInvoiceNumber] = useState('');
  const [supplierId, setSupplierId] = useState('');
  const [extraCosts, setExtraCosts] = useState('0');
  const [purchaseDate, setPurchaseDate] = useState(new Date().toISOString().slice(0, 10));
  const [items, setItems] = useState<DraftItem[]>([]);
  const { contains } = useFilter({ sensitivity: 'base' });

  // Add raw material modal
  const [addMaterialOpen, setAddMaterialOpen] = useState(false);
  const [addMaterialBarcode, setAddMaterialBarcode] = useState('');
  const [addMaterialName, setAddMaterialName] = useState('');
  const [addMaterialUnit, setAddMaterialUnit] = useState('piece');
  const [addMaterialPrice, setAddMaterialPrice] = useState('');
  const [isCheckingMasterProduct, setIsCheckingMasterProduct] = useState(false);
  const [addMaterialSubmitting, setAddMaterialSubmitting] = useState(false);

  const reload = useCallback(async () => {
    if (!restaurantId) return;
    const [s, m, afp, d, mp] = await Promise.all([
      accountingDb.suppliers.where('restaurantId').equals(restaurantId).reverse().sortBy('id'),
      accountingDb.rawMaterials.where('restaurantId').equals(restaurantId).reverse().sortBy('id'),
      accountingDb.finalProducts.where('restaurantId').equals(restaurantId).toArray(),
      accountingDb.purchaseInvoices.where('restaurantId').equals(restaurantId).reverse().sortBy('id'),
      getLocalProducts(restaurantId).then((r) =>
        r.data.filter((p) => p._syncStatus === 'synced'),
      ),
    ]);
    setSuppliers(s);
    setMaterials(m);
    setAccountingFinalProducts(afp);
    setDrafts(d);
    setMenuProducts(mp);
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
      return acc + Number(item.quantity || 0) * Number(normalizePriceInput(item.unitPrice) || 0);
    }, 0);
    return itemsSum + Number(normalizePriceInput(extraCosts) || 0);
  }, [items, extraCosts]);

  // ── helpers ───────────────────────────────────────────────────────────────

  const updateItem = (idx: number, patch: Partial<DraftItem>) =>
    setItems((prev) => prev.map((x, i) => (i === idx ? { ...x, ...patch } : x)));

  const openCreate = () => {
    setEditingId(null);
    setInvoiceNumber('');
    setSupplierId('');
    setExtraCosts('0');
    setPurchaseDate(new Date().toISOString().slice(0, 10));
    setItems([emptyItem()]);
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
        const price = Number(normalizePriceInput(x.unitPrice) || 0);

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
          return { finalProductId: fpId, quantity: qty, unitPrice: price, salePrice };
        } else {
          if (!x.rawMaterialId || qty <= 0) return null;
          return { rawMaterialId: Number(x.rawMaterialId), quantity: qty, unitPrice: price, salePrice };
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

  const handleBarcodeApply = useCallback(async (code: string) => {
    if (!code.trim()) return;
    const c = code.trim();
    const matched = materials.find((m) => String(m.barcode || '').trim() === c);
    if (matched) {
      setItems((prev) => {
        const existingIdx = prev.findIndex(
          (x) => x.type === 'raw_material' && x.rawMaterialId === String(matched.id),
        );
        if (existingIdx !== -1) {
          return prev.map((x, i) =>
            i === existingIdx
              ? { ...x, quantity: String(Number(x.quantity || 1) + 1) }
              : x,
          );
        }
        return [...prev, { ...emptyItem(), type: 'raw_material', rawMaterialId: String(matched.id) }];
      });
      return;
    }
    setAddMaterialBarcode(c);
    setAddMaterialName('');
    setAddMaterialUnit('piece');
    setAddMaterialPrice('');
    setIsCheckingMasterProduct(true);
    setAddMaterialOpen(true);
    try {
      const master = await getMasterProductByBarcode(c, token || undefined);
      if (master) setAddMaterialName(master.name);
    } finally {
      setIsCheckingMasterProduct(false);
    }
  }, [materials, token]);

  // اسکنر بارکد: کاراکترها رو سریع تایپ می‌کنه و با Enter ختم می‌شه
  useEffect(() => {
    if (!open) return;
    let buffer = '';
    let lastTime = 0;

    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') return;
      const now = Date.now();
      if (e.key === 'Enter') {
        if (buffer.length >= 3) void handleBarcodeApply(buffer);
        buffer = '';
        return;
      }
      if (e.key.length === 1) {
        if (now - lastTime > 80) buffer = '';
        buffer += e.key;
        lastTime = now;
      }
    };

    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, handleBarcodeApply]);

  const handleSubmitAddMaterial = async () => {
    if (!restaurantId || !addMaterialName.trim()) {
      toast.error('نام ماده اولیه الزامی است');
      return;
    }
    setAddMaterialSubmitting(true);
    try {
      const newMaterial = await createRawMaterialLocal({
        restaurantId,
        name: addMaterialName.trim(),
        unit: addMaterialUnit,
        barcode: addMaterialBarcode || undefined,
      });
      await reload();
      const price = addMaterialPrice.trim() || '0';
      setItems((prev) =>
        prev.length === 0
          ? [{ ...emptyItem(), type: 'raw_material', rawMaterialId: String(newMaterial.id), unitPrice: price }]
          : prev.map((x, i) =>
              i === prev.length - 1
                ? { ...x, type: 'raw_material' as ItemType, rawMaterialId: String(newMaterial.id), unitPrice: price }
                : x,
            ),
      );
      setAddMaterialOpen(false);
    } catch {
      toast.error('خطا در ثبت ماده اولیه. لطفاً دوباره تلاش کنید.');
    } finally {
      setAddMaterialSubmitting(false);
    }
  };

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
      ) : (
        <div className="flex flex-col gap-3">
          {drafts.map((d) => {
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
                      {!isServerSynced && (
                        <Button
                          size="sm"
                          variant="flat"
                          onPress={async () => {
                            const lines = await getPurchaseInvoiceItemsByInvoiceId(d.id);
                            setEditingId(d.id);
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
                                  unitPrice: String(x.unitPrice),
                                  salePrice: x.salePrice != null ? String(x.salePrice) : '',
                                };
                              }),
                            );
                            setItemSearch('');
                            setBarcode('');
                            setOpen(true);
                          }}
                        >
                          ویرایش
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
        </div>
      )}

      {/* Create / Edit Modal */}
      <Modal isOpen={open} onOpenChange={setOpen}>
        <ModalShell size="full">
          <ModalHeader>{editingId ? 'ویرایش پیش‌نویس خرید' : 'ثبت پیش‌نویس خرید'}</ModalHeader>
          <ModalBody className="gap-4">

            {/* Basic info */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              <Input
                label="شماره فاکتور"
                value={invoiceNumber}
                onValueChange={setInvoiceNumber}
                isRequired
              />
              <Select
                label="تامین‌کننده"
                selectedKeys={supplierId ? [supplierId] : []}
                onSelectionChange={(k) => setSupplierId(String(Array.from(k)[0] || ''))}
              >
                {suppliers.map((s) => <SelectItem key={String(s.id)}>{s.name}</SelectItem>)}
              </Select>
              <ShamsiDatePicker
                label="تاریخ فاکتور"
                value={purchaseDate}
                onChange={setPurchaseDate}
                isRequired
              />
            </div>

            {/* Items */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold text-foreground">آیتم‌های خرید</span>
                <span className="text-xs text-default-400">{items.length} آیتم</span>
              </div>

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
                const lineTotal =
                  Number(line.quantity || 0) * Number(normalizePriceInput(line.unitPrice) || 0);
                const activeOptions = isFinalProduct ? menuProductOptions : materialOptions;
                const selectedKey = isFinalProduct ? line.menuProductId : line.rawMaterialId;

                return (
                  <div
                    key={idx}
                    className="rounded-xl bg-default-100 p-3 space-y-2 border border-default-200"
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
                      onSelectionChange={(k) =>
                        k === 'final_product'
                          ? updateItem(idx, { type: 'final_product', rawMaterialId: '' })
                          : updateItem(idx, { type: 'raw_material', menuProductId: '', finalProductId: '' })
                      }
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
                    {activeOptions.length === 0 ? (
                      <p className="text-xs text-default-400 py-1">
                        {isFinalProduct
                          ? 'هیچ محصولی یافت نشد — مطمئن شوید محصولات منو همگام‌سازی شده‌اند'
                          : 'هیچ ماده اولیه‌ای ثبت نشده'}
                      </p>
                    ) : (
                      <Autocomplete
                        className="w-full"
                        value={selectedKey || null}
                        onChange={(k) => {
                          const val = String(k || '');
                          updateItem(
                            idx,
                            isFinalProduct
                              ? { menuProductId: val, finalProductId: '' }
                              : { rawMaterialId: val },
                          );
                        }}
                      >
                        <Label>{isFinalProduct ? 'محصول رستوران' : 'ماده اولیه'}</Label>
                        <Autocomplete.Trigger>
                          <Autocomplete.Value placeholder={`انتخاب ${isFinalProduct ? 'محصول' : 'ماده اولیه'}...`} />
                          <Autocomplete.ClearButton />
                          <Autocomplete.Indicator />
                        </Autocomplete.Trigger>
                        <Autocomplete.Popover>
                          <Autocomplete.Filter filter={contains}>
                            <SearchField name={`search-item-${idx}`} variant="secondary">
                              <SearchField.Group>
                                <SearchField.SearchIcon />
                                <SearchField.Input placeholder="جستجو..." />
                                <SearchField.ClearButton />
                              </SearchField.Group>
                            </SearchField>
                            <ListBox renderEmptyState={() => <EmptyState>موردی یافت نشد</EmptyState>}>
                              {activeOptions.map((opt) => (
                                <ListBox.Item key={opt.id} id={opt.id} textValue={opt.label}>
                                  {opt.label}
                                  <ListBox.ItemIndicator />
                                </ListBox.Item>
                              ))}
                            </ListBox>
                          </Autocomplete.Filter>
                        </Autocomplete.Popover>
                      </Autocomplete>
                    )}

                    <div className="grid grid-cols-3 gap-2">
                      <Input
                        type="number"
                        label="مقدار"
                        value={line.quantity}
                        onValueChange={(v) => updateItem(idx, { quantity: v })}
                      />
                      <Input
                        type="text"
                        inputMode="numeric"
                        label="قیمت خرید"
                        value={formatPriceInput(line.unitPrice)}
                        onValueChange={(v) => updateItem(idx, { unitPrice: normalizePriceInput(v) })}
                        endContent={
                          <span className="text-default-400 text-xs whitespace-nowrap">تومان</span>
                        }
                      />
                      <Input
                        type="text"
                        inputMode="numeric"
                        label="قیمت فروش"
                        placeholder="اختیاری"
                        value={formatPriceInput(line.salePrice)}
                        onValueChange={(v) => updateItem(idx, { salePrice: normalizePriceInput(v) })}
                        endContent={
                          <span className="text-default-400 text-xs whitespace-nowrap">تومان</span>
                        }
                      />
                    </div>

                    <Button
                      size="sm"
                      color="danger"
                      variant="light"
                      onPress={() => setItems((prev) => prev.filter((_, i) => i !== idx))}
                    >
                      حذف آیتم
                    </Button>
                  </div>
                );
              })}

              <Button
                variant="flat"
                size="sm"
                className="w-full"
                onPress={() => setItems((prev) => [...prev, emptyItem()])}
              >
                + افزودن آیتم
              </Button>
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
                  <span className="text-default-400 text-sm whitespace-nowrap">تومان</span>
                }
              />
              <div className="flex items-center justify-between rounded-xl bg-default-200 px-4 py-3">
                <span className="text-sm text-default-600">جمع کل:</span>
                <span className="font-bold text-foreground text-lg">{formatCurrency(runningTotal)}</span>
              </div>
            </div>
          </ModalBody>
          <ModalFooter>
            <Button variant="flat" onPress={() => setOpen(false)}>انصراف</Button>
            <Button color="primary" isLoading={isSaving} onPress={handleSave}>
              {editingId ? 'ذخیره تغییرات' : 'ثبت پیش‌نویس'}
            </Button>
          </ModalFooter>
        </ModalShell>
      </Modal>

      {/* Add raw material modal */}
      <Modal isOpen={addMaterialOpen} onOpenChange={setAddMaterialOpen} size="lg">
        <ModalShell>
          <ModalHeader>افزودن ماده اولیه جدید</ModalHeader>
          <ModalBody className="gap-3">
            {isCheckingMasterProduct && (
              <div className="flex items-center justify-center gap-2 text-default-500 text-sm py-2">
                <Spinner size="sm" />
                <span>در حال جستجو در محصولات پایه...</span>
              </div>
            )}
            <Input label="بارکد" value={addMaterialBarcode} isReadOnly />
            <Input
              label="نام ماده اولیه"
              value={addMaterialName}
              onValueChange={setAddMaterialName}
              isDisabled={isCheckingMasterProduct}
              isRequired
            />
            <Select
              label="واحد"
              selectedKeys={[addMaterialUnit]}
              onSelectionChange={(k) => setAddMaterialUnit(String(Array.from(k)[0] || 'piece'))}
              isDisabled={isCheckingMasterProduct}
            >
              {RAW_MATERIAL_UNITS.map((u) => (
                <SelectItem key={u}>{UNIT_LABELS[u] ?? u}</SelectItem>
              ))}
            </Select>
            <Input
              type="text"
              inputMode="numeric"
              label="قیمت واحد (برای این فاکتور)"
              value={formatPriceInput(addMaterialPrice)}
              onValueChange={(v) => setAddMaterialPrice(normalizePriceInput(v))}
              isDisabled={isCheckingMasterProduct}
              endContent={
                <span className="text-default-400 text-sm whitespace-nowrap">تومان</span>
              }
            />
          </ModalBody>
          <ModalFooter>
            <Button variant="flat" onPress={() => setAddMaterialOpen(false)}>انصراف</Button>
            <Button
              color="primary"
              isLoading={addMaterialSubmitting}
              isDisabled={isCheckingMasterProduct}
              onPress={handleSubmitAddMaterial}
            >
              ثبت ماده اولیه
            </Button>
          </ModalFooter>
        </ModalShell>
      </Modal>
    </div>
  );
}
