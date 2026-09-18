import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Card, CardContent, Chip, Modal, ModalBody, ModalFooter, ModalHeader, Spinner } from '@heroui/react';
import { Button } from '../../ui/compat-button';
import { Input } from '../../ui/compat-input';
import { ModalShell } from '../../ui/modal-shell';
import { Select, SelectItem } from '../../ui/compat-select';
import { ShamsiDatePicker } from '../../ui/ShamsiDatePicker';
import { useAuthStore } from '../../store/authStore';
import { useFiscalYearStore } from '../../store/fiscalYearStore';
import { useSyncStore } from '../../store/syncStore';
import {
  accountingDb,
  getPurchaseInvoiceItemsByInvoiceId,
  createPurchaseReturnLocal,
  upsertPulledPurchaseReturns,
  upsertPulledPurchaseReturnItems,
} from '../../services/accountingLocalDb';
import {
  listPurchaseReturns,
  createPurchaseReturn,
  approvePurchaseReturn,
  cancelPurchaseReturn,
} from '../../services/api';
import { toast } from '../../utils/toast';
import { toShamsiDate } from '../../utils/date';

const formatCurrency = (n: number) =>
  new Intl.NumberFormat('fa-IR').format(Math.round(n)) + ' ریال';

const toJalali = (d?: string) => toShamsiDate(d);

const normalizePriceInput = (v: string) =>
  String(v || '')
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 1632))
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 1776))
    .replace(/[^\d]/g, '');

const STATUS_CONFIG: Record<string, { label: string; color: 'warning' | 'success' | 'danger' | 'default' }> = {
  draft: { label: 'پیش‌نویس', color: 'warning' },
  approved: { label: 'تایید شده', color: 'success' },
  cancelled: { label: 'لغو شده', color: 'danger' },
};

type ReturnItem = {
  rawMaterialId: string;
  finalProductId: string;
  name: string;
  maxQty: number;
  quantity: string;
  unitPrice: string;
};

export default function AccountingPurchaseReturnsPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, token } = useAuthStore();
  const restaurantId = user?.restaurants?.[0]?.id ? Number(user.restaurants[0].id) : undefined;
  const { selectedByRestaurant } = useFiscalYearStore();
  const fiscalYearId = restaurantId ? selectedByRestaurant[restaurantId] : undefined;
  const lastSyncedAt = useSyncStore((s) => s.lastSyncedAt);

  const [returns, setReturns] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [isOnline, setIsOnline] = useState(true);

  // ─── لیست فاکتورهای تایید شده (از Dexie) ─────────────────────────────────
  const [approvedInvoices, setApprovedInvoices] = useState<any[]>([]);
  const [suppliers, setSuppliers] = useState<any[]>([]);

  // ─── فرم ایجاد ────────────────────────────────────────────────────────────
  const [createOpen, setCreateOpen] = useState(false);
  const [selectedInvoiceId, setSelectedInvoiceId] = useState('');
  const [returnDate, setReturnDate] = useState(new Date().toISOString().slice(0, 10));
  const [notes, setNotes] = useState('');
  const [returnItems, setReturnItems] = useState<ReturnItem[]>([]);
  const [loadingInvoiceItems, setLoadingInvoiceItems] = useState(false);
  const [saving, setSaving] = useState(false);

  // ─── عملیات ──────────────────────────────────────────────────────────────
  const [actionLoading, setActionLoading] = useState<number | null>(null);

  // ─── بارگذاری ────────────────────────────────────────────────────────────
  const reload = useCallback(async () => {
    if (!restaurantId || !token) return;
    setLoading(true);
    try {
      const serverRows = await listPurchaseReturns({ restaurantId, fiscalYearId }, token);
      setIsOnline(true);
      // ذخیره در Dexie برای دسترسی آفلاین
      if (serverRows.length) {
        const items = serverRows.flatMap((r: any) => r.items || []);
        await upsertPulledPurchaseReturns(serverRows.map((r: any) => ({ ...r, restaurantId })));
        if (items.length) await upsertPulledPurchaseReturnItems(items);
      }
      setReturns([...serverRows].sort((a, b) => String(b.returnDate).localeCompare(String(a.returnDate))));
    } catch {
      setIsOnline(false);
      const local = await accountingDb.purchaseReturns
        .where('restaurantId')
        .equals(restaurantId)
        .reverse()
        .sortBy('returnDate');
      setReturns(local);
    } finally {
      setLoading(false);
    }

    // بارگذاری فاکتورهای تایید‌شده و تامین‌کنندگان از Dexie
    const [invs, sups] = await Promise.all([
      accountingDb.purchaseInvoices
        .where('restaurantId')
        .equals(restaurantId)
        .filter((x) => x.status === 'approved')
        .toArray(),
      accountingDb.suppliers
        .where('restaurantId')
        .equals(restaurantId)
        .toArray(),
    ]);
    setApprovedInvoices(invs);
    setSuppliers(sups);
  }, [restaurantId, token, fiscalYearId]);

  useEffect(() => { void reload(); }, [reload]);
  useEffect(() => { if (lastSyncedAt) void reload(); }, [lastSyncedAt, reload]);

  // اگر از صفحه فاکتورها با invoiceId آمده باشیم، مودال را باز کن
  useEffect(() => {
    const state = location.state as { invoiceId?: number } | null;
    if (state?.invoiceId) {
      setSelectedInvoiceId(String(state.invoiceId));
      setCreateOpen(true);
      // پاک کردن state تا با refresh دوباره باز نشود
      window.history.replaceState({}, '');
    }
  }, [location.state]);

  // ─── لود آیتم‌های فاکتور انتخاب‌شده ──────────────────────────────────────
  useEffect(() => {
    if (!selectedInvoiceId) { setReturnItems([]); return; }
    const loadItems = async () => {
      setLoadingInvoiceItems(true);
      const invoiceId = Number(selectedInvoiceId);
      const lineItems = await getPurchaseInvoiceItemsByInvoiceId(invoiceId);
      const materials = await accountingDb.rawMaterials.toArray();
      const finalProducts = await accountingDb.finalProducts.toArray();
      const mapped: ReturnItem[] = lineItems.map((x: any) => {
        let name = '—';
        if (x.rawMaterialId) {
          name = materials.find((m) => m.id === Number(x.rawMaterialId))?.name || `ماده #${x.rawMaterialId}`;
        } else if (x.finalProductId) {
          name = finalProducts.find((fp) => fp.id === Number(x.finalProductId))?.name || `محصول #${x.finalProductId}`;
        }
        return {
          rawMaterialId: String(x.rawMaterialId || ''),
          finalProductId: String(x.finalProductId || ''),
          name,
          maxQty: Number(x.quantity || 0),
          quantity: String(x.quantity || 0),
          unitPrice: String(x.unitPrice || 0),
        };
      });
      setReturnItems(mapped);
      setLoadingInvoiceItems(false);
    };
    void loadItems();
  }, [selectedInvoiceId]);

  // ─── نام تامین‌کننده برای فاکتور ─────────────────────────────────────────
  const invoiceOptions = useMemo(() =>
    approvedInvoices.map((inv) => {
      const sup = suppliers.find((s) => s.id === inv.supplierId)?.name || '—';
      return { id: String(inv.id), label: `#${inv.invoiceNumber} — ${sup}` };
    }),
    [approvedInvoices, suppliers],
  );

  // ─── کل مرجوعی ──────────────────────────────────────────────────────────
  const totalAmount = useMemo(() =>
    returnItems.reduce((s, i) => s + Number(i.quantity || 0) * Number(normalizePriceInput(i.unitPrice) || 0), 0),
    [returnItems],
  );

  const updateReturnItem = (idx: number, patch: Partial<ReturnItem>) =>
    setReturnItems((prev) => prev.map((x, i) => (i === idx ? { ...x, ...patch } : x)));

  // ─── ثبت مرجوعی ─────────────────────────────────────────────────────────
  const handleCreate = async () => {
    if (!restaurantId || !token || !selectedInvoiceId) {
      toast.error('فاکتور خرید را انتخاب کنید');
      return;
    }
    const lines = returnItems.filter((x) => Number(x.quantity) > 0);
    if (!lines.length) {
      toast.error('حداقل یک آیتم با تعداد بیشتر از صفر وارد کنید');
      return;
    }
    setSaving(true);
    const payload = {
      restaurantId,
      purchaseInvoiceId: Number(selectedInvoiceId),
      returnDate,
      notes: notes.trim() || undefined,
      items: lines.map((x) => ({
        ...(x.rawMaterialId ? { rawMaterialId: Number(x.rawMaterialId) } : {}),
        ...(x.finalProductId ? { finalProductId: Number(x.finalProductId) } : {}),
        quantity: Number(x.quantity),
        unitPrice: Number(normalizePriceInput(x.unitPrice) || 0),
      })),
    };
    try {
      if (isOnline) {
        await createPurchaseReturn(payload, token);
      } else {
        await createPurchaseReturnLocal(payload);
      }
      toast.success('مرجوعی ثبت شد');
      setCreateOpen(false);
      resetCreateForm();
      void reload();
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'خطا در ثبت مرجوعی');
    } finally {
      setSaving(false);
    }
  };

  const resetCreateForm = () => {
    setSelectedInvoiceId('');
    setReturnDate(new Date().toISOString().slice(0, 10));
    setNotes('');
    setReturnItems([]);
  };

  // ─── تایید مرجوعی ───────────────────────────────────────────────────────
  const handleApprove = async (ret: any) => {
    if (!restaurantId || !token) return;
    setActionLoading(ret.id);
    try {
      await approvePurchaseReturn(ret.id, restaurantId, token);
      toast.success('مرجوعی تایید شد — موجودی انبار به‌روز شد');
      void reload();
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'خطا در تایید مرجوعی');
    } finally {
      setActionLoading(null);
    }
  };

  // ─── لغو مرجوعی ────────────────────────────────────────────────────────
  const handleCancel = async (ret: any) => {
    if (!restaurantId || !token) return;
    setActionLoading(ret.id);
    try {
      await cancelPurchaseReturn(ret.id, restaurantId, token);
      toast.success('مرجوعی لغو شد');
      void reload();
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'خطا در لغو مرجوعی');
    } finally {
      setActionLoading(null);
    }
  };

  // ─── رندر ────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-background p-4 space-y-4" dir="rtl">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <h1 className="text-xl font-bold text-foreground">برگشت از خرید</h1>
          {!isOnline && (
            <Chip size="sm" color="warning" variant="flat">
              <Chip.Label>در انتظار اتصال</Chip.Label>
            </Chip>
          )}
        </div>
        <div className="flex gap-2">
          <Button variant="flat" size="sm" onPress={() => navigate('/accounting')}>
            بازگشت
          </Button>
          <Button
            color="primary"
            size="sm"
            onPress={() => { resetCreateForm(); setCreateOpen(true); }}
          >
            + ثبت مرجوعی
          </Button>
        </div>
      </div>

      {!isOnline && (
        <div className="rounded-2xl border border-warning/30 bg-warning-soft px-4 py-3 text-warning-soft-foreground text-sm">
          اتصال به سرور برقرار نیست — تغییرات ذخیره می‌شوند و پس از برقراری اتصال همگام‌سازی خواهند شد.
        </div>
      )}

      {/* List */}
      {loading ? (
        <div className="flex justify-center py-16">
          <Spinner size="lg" />
        </div>
      ) : returns.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 gap-3">
            <div className="w-14 h-14 rounded-full bg-default flex items-center justify-center">
              <svg className="w-7 h-7 text-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                  d="M16 15v-1a4 4 0 00-4-4H8m0 0l3 3m-3-3l3-3m9 14V5a2 2 0 00-2-2H6a2 2 0 00-2 2v16l4-2 4 2 4-2 4 2z" />
              </svg>
            </div>
            <p className="text-muted text-sm">هیچ مرجوعی خریدی ثبت نشده است</p>
            {isOnline && (
              <Button color="primary" onPress={() => { resetCreateForm(); setCreateOpen(true); }}>
                ثبت اولین مرجوعی
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="flex flex-col gap-3">
          {returns.map((ret) => {
            const cfg = STATUS_CONFIG[ret.status] ?? STATUS_CONFIG.draft;
            const isDraft = ret.status === 'draft';
            const isLoading = actionLoading === ret.id;
            const supplierName = ret.supplier?.name
              || suppliers.find((s) => s.id === ret.supplierId)?.name
              || '—';
            const invoiceNumber = ret.purchaseInvoice?.invoiceNumber
              || approvedInvoices.find((i) => i.id === ret.purchaseInvoiceId)?.invoiceNumber
              || ret.purchaseInvoiceId;
            return (
              <Card key={ret.id} className="hover:shadow-md transition-shadow">
                <CardContent className="py-3 px-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex flex-col gap-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-foreground">
                          مرجوعی {ret.returnNumber || `#${ret.id}`}
                        </span>
                        <Chip color={cfg.color} size="sm" variant="soft">
                          <Chip.Label>{cfg.label}</Chip.Label>
                        </Chip>
                      </div>
                      <div className="flex flex-wrap gap-3 text-xs text-muted">
                        <span>فاکتور: #{invoiceNumber}</span>
                        <span>{supplierName}</span>
                        {ret.returnDate && <span>{toJalali(ret.returnDate)}</span>}
                        {ret.totalAmount > 0 && (
                          <span className="font-medium text-foreground">
                            {formatCurrency(ret.totalAmount)}
                          </span>
                        )}
                      </div>
                      {ret.notes && (
                        <p className="text-xs text-muted truncate">{ret.notes}</p>
                      )}
                    </div>
                    {isDraft && isOnline && (
                      <div className="flex gap-1 shrink-0">
                        <Button
                          size="sm"
                          color="success"
                          variant="flat"
                          isLoading={isLoading}
                          onPress={() => handleApprove(ret)}
                        >
                          تایید
                        </Button>
                        <Button
                          size="sm"
                          color="danger"
                          variant="light"
                          isLoading={isLoading}
                          onPress={() => handleCancel(ret)}
                        >
                          لغو
                        </Button>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Create Modal */}
      <Modal isOpen={createOpen} onOpenChange={(open) => { if (!open) { resetCreateForm(); } setCreateOpen(open); }}>
        <ModalShell size="lg">
          <ModalHeader>ثبت برگشت از خرید</ModalHeader>
          <ModalBody className="gap-4" dir="rtl">
            {approvedInvoices.length === 0 ? (
              <div className="rounded-2xl border border-warning/30 bg-warning-soft p-4 text-warning-soft-foreground text-sm">
                فاکتور تایید‌شده‌ای یافت نشد. ابتدا یک فاکتور خرید را تایید کنید.
              </div>
            ) : (
              <>
                <Select
                  label="فاکتور خرید (تایید شده)"
                  selectedKeys={selectedInvoiceId ? [selectedInvoiceId] : []}
                  onSelectionChange={(k) => setSelectedInvoiceId(String(Array.from(k)[0] || ''))}
                  isRequired
                >
                  {invoiceOptions.map((opt) => (
                    <SelectItem key={opt.id} textValue={opt.label}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </Select>

                <ShamsiDatePicker
                  label="تاریخ مرجوعی"
                  value={returnDate}
                  onChange={setReturnDate}
                  isRequired
                />

                <Input
                  label="یادداشت (اختیاری)"
                  value={notes}
                  onValueChange={setNotes}
                  placeholder="توضیحات..."
                />

                {/* آیتم‌ها */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-semibold">آیتم‌های مرجوعی</span>
                    {loadingInvoiceItems && <Spinner size="sm" />}
                  </div>

                  {!selectedInvoiceId && (
                    <p className="text-xs text-muted py-2">ابتدا فاکتور را انتخاب کنید</p>
                  )}

                  {returnItems.map((item, idx) => (
                    <div
                      key={idx}
                      className="rounded-xl bg-default-soft border border-border p-3 space-y-2"
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium text-foreground">{item.name}</span>
                        <span className="text-xs text-muted">حداکثر: {item.maxQty}</span>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <Input
                          type="number"
                          label="تعداد مرجوعی"
                          value={item.quantity}
                          onValueChange={(v) =>
                            updateReturnItem(idx, {
                              quantity: String(Math.min(Math.max(0, Number(v)), item.maxQty)),
                            })
                          }
                          min={0}
                          max={item.maxQty}
                        />
                        <Input
                          type="text"
                          inputMode="numeric"
                          label="قیمت واحد"
                          value={new Intl.NumberFormat('en-US').format(Number(normalizePriceInput(item.unitPrice) || 0))}
                          onValueChange={(v) => updateReturnItem(idx, { unitPrice: normalizePriceInput(v) })}
                          endContent={<span className="text-muted text-xs whitespace-nowrap">ریال</span>}
                        />
                      </div>
                    </div>
                  ))}
                </div>

                {totalAmount > 0 && (
                  <div className="rounded-2xl bg-success-soft border border-success/30 px-4 py-3">
                    <span className="text-sm text-success-soft-foreground">جمع مرجوعی: </span>
                    <span className="font-bold text-success-soft-foreground">{formatCurrency(totalAmount)}</span>
                  </div>
                )}
              </>
            )}
          </ModalBody>
          <ModalFooter>
            <Button variant="flat" onPress={() => { resetCreateForm(); setCreateOpen(false); }}>
              انصراف
            </Button>
            <Button
              color="primary"
              isLoading={saving}
              isDisabled={!selectedInvoiceId || approvedInvoices.length === 0}
              onPress={handleCreate}
            >
              ثبت مرجوعی
            </Button>
          </ModalFooter>
        </ModalShell>
      </Modal>
    </div>
  );
}
