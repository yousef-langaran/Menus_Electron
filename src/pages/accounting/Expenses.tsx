import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, Modal, ModalBody, ModalFooter, ModalHeader } from '@heroui/react';
import { Button } from '../../ui/compat-button';
import { Input } from '../../ui/compat-input';
import { ModalShell } from '../../ui/modal-shell';
import { Select, SelectItem } from '../../ui/compat-select';
import { useAuthStore } from '../../store/authStore';
import { useFiscalYearStore } from '../../store/fiscalYearStore';
import {
  accountingDb,
  cancelPendingSyncOp,
  createOperationalExpenseLocal,
  deleteOperationalExpenseLocal,
  listExpenseCategoriesLocal,
  markPendingSyncOpsInFlight,
  restorePendingSyncOps,
  upsertPulledEntities,
} from '../../services/accountingLocalDb';
import { formatPriceInput, parseFormattedNumber } from '../../utils/money';
import {
  listExpenseCategories,
  listFiscalYears,
  listOperationalExpensesOnline,
  createOperationalExpenseOnline,
  updateOperationalExpenseOnline,
  deleteOperationalExpenseOnline,
  ExpenseCategoryRow,
} from '../../services/api';
import { toast } from '../../utils/toast';
import { ShamsiDatePicker } from '../../ui/ShamsiDatePicker';
import { toShamsiDate } from '../../utils/date';

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function formatAmount(n: number) {
  return Number(n).toLocaleString('fa-IR');
}

export default function AccountingExpensesPage() {
  const navigate = useNavigate();
  const { user, token } = useAuthStore();
  const restaurantId = user?.restaurants?.[0]?.id ? Number(user.restaurants[0].id) : undefined;

  const { selectedByRestaurant, setSelectedFiscalYear } = useFiscalYearStore();
  const fiscalYearId = restaurantId ? selectedByRestaurant[restaurantId] : undefined;

  // اگر کاربر مستقیم به این صفحه آمده (بدون عبور از Accounting.tsx)، سال مالی فعال را بارگذاری کن
  useEffect(() => {
    if (fiscalYearId || !restaurantId || !token) return;
    listFiscalYears(restaurantId, token)
      .then((rows) => {
        const active = rows.find((x: any) => x.isActive && x.status === 'open')?.id;
        if (active) setSelectedFiscalYear(restaurantId, active);
      })
      .catch(() => {});
  }, [restaurantId, token, fiscalYearId, setSelectedFiscalYear]);

  const [rows, setRows] = useState<any[]>([]);
  const [categories, setCategories] = useState<ExpenseCategoryRow[]>([]);
  const categoryTreeOptions = useMemo(() => {
    const byParent = new Map<number | null, ExpenseCategoryRow[]>();
    categories.forEach((c) => {
      const key = c.parentCategoryId ?? null;
      if (!byParent.has(key)) byParent.set(key, []);
      byParent.get(key)!.push(c);
    });
    const options: Array<ExpenseCategoryRow & { depth: number }> = [];
    const visited = new Set<number>();
    const walk = (parentId: number | null, depth: number) => {
      (byParent.get(parentId) || []).forEach((c) => {
        if (visited.has(c.id)) return;
        visited.add(c.id);
        options.push({ ...c, depth });
        walk(c.id, depth + 1);
      });
    };
    walk(null, 0);
    categories.forEach((c) => { if (!visited.has(c.id)) options.push({ ...c, depth: 0 }); });
    return options;
  }, [categories]);
  const [search, setSearch] = useState('');
  const [isOnline, setIsOnline] = useState(false);
  const [loading, setLoading] = useState(false);

  // ─── فرم ثبت ─────────────────────────────────────────────────────────────
  const [createOpen, setCreateOpen] = useState(false);
  const [categoryId, setCategoryId] = useState('');
  const [amount, setAmount] = useState('');
  const [expenseDate, setExpenseDate] = useState(todayIso());
  const [description, setDescription] = useState('');
  const [saving, setSaving] = useState(false);

  // ─── فرم ویرایش ──────────────────────────────────────────────────────────
  const [editOpen, setEditOpen] = useState(false);
  const [editingRow, setEditingRow] = useState<any>(null);
  const [editCategoryId, setEditCategoryId] = useState('');
  const [editAmount, setEditAmount] = useState('');
  const [editExpenseDate, setEditExpenseDate] = useState(todayIso());
  const [editDescription, setEditDescription] = useState('');
  const [editSaving, setEditSaving] = useState(false);

  // ─── بارگذاری از local (فوری) ────────────────────────────────────────────
  const reloadLocal = useCallback(async () => {
    if (!restaurantId) {
      // لاگ تشخیصی موقت — برای ردیابی گزارش «صفحه‌ی هزینه‌ها کلاً خالی می‌شود»
      console.warn('[Expenses] reloadLocal skipped: restaurantId is falsy', { restaurantId });
      return;
    }
    const all = await accountingDb.operationalExpenses.toArray();
    const matched = all.filter((x) => Number(x.restaurantId) === restaurantId);
    console.info('[Expenses] reloadLocal', {
      restaurantId,
      totalInDexie: all.length,
      matchedForThisRestaurant: matched.length,
      distinctRestaurantIdsInDexie: Array.from(new Set(all.map((x) => x.restaurantId))),
    });
    setRows(matched.sort((a, b) => String(b.expenseDate).localeCompare(String(a.expenseDate))));
  }, [restaurantId]);

  // ─── بارگذاری کامل (local + سینک با سرور در background) ─────────────────
  const reload = useCallback(async () => {
    if (!restaurantId || !token) return;
    setLoading(true);
    // اول local را فوری نمایش بده
    await reloadLocal();
    setLoading(false);
    // بعد در background از سرور sync کن
    try {
      const serverRows = await listOperationalExpensesOnline(restaurantId, token, fiscalYearId);
      setIsOnline(true);
      // OperationalExpense فقط رابطه‌ی restaurant (FK) دارد، نه ستون مسطح
      // restaurantId — و این endpoint (بر خلاف getChangedRows در سینک پس‌زمینه)
      // رابطه‌ی restaurant را هم join نمی‌کند. بدون این stamp صریح، ردیف‌ها با
      // restaurantId=undefined در Dexie ذخیره می‌شوند و reloadLocal (که فیلتر
      // می‌کند بر اساس restaurantId) برای همیشه نامرئی‌شان می‌بیند — همان باگ
      // «صفحه‌ی هزینه‌ها کلاً خالی می‌ماند وقتی از این مسیر پر شده».
      const stampedRows = serverRows.map((r: any) => ({ ...r, restaurantId }));
      // سرور را در local ذخیره کن (upsert — رکورد محلیِ هنوز سینک‌نشده حذف نمی‌شود)
      await upsertPulledEntities('operational_expense', stampedRows);
      // از local (که شامل رکوردهای optimistic هنوز push‌نشده هم هست) دوباره بخوان —
      // اگر مستقیماً rows را برابر serverRows بگذاریم، هزینه‌ای که همین الان ثبت
      // شده ولی هنوز پاسخ سرور نرسیده، از لیست محو می‌شود (انگار ثبت نشده).
      await reloadLocal();
    } catch (error) {
      // لاگ تشخیصی موقت — برای ردیابی گزارش «صفحه‌ی هزینه‌ها کلاً خالی می‌شود»
      console.warn('[Expenses] online fetch failed, falling back to local-only', { restaurantId, fiscalYearId, error });
      setIsOnline(false);
    }
  }, [restaurantId, token, fiscalYearId, reloadLocal]);

  const loadCategories = useCallback(async () => {
    if (!restaurantId || !token) return;
    try {
      const cats = await listExpenseCategories(restaurantId, token);
      setCategories(cats.filter((c) => c.isActive));
    } catch {
      const local = await listExpenseCategoriesLocal(restaurantId);
      setCategories(local.filter((c) => c.isActive));
    }
  }, [restaurantId, token]);

  useEffect(() => {
    void reload();
    void loadCategories();
  }, [reload, loadCategories]);

  // ─── فیلتر جستجو ─────────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((x) =>
      String(x.description || '').toLowerCase().includes(q) ||
      String(x.expenseDate || '').includes(q) ||
      String(x.expenseCategory?.name || '').toLowerCase().includes(q),
    );
  }, [rows, search]);

  // نمایش نام دسته — هم از سرور (expenseCategory.name) هم از کش محلی
  const categoryName = (row: any) => {
    if (row.expenseCategory?.name) return row.expenseCategory.name;
    const id = Number(row.expenseCategoryId);
    return categories.find((c) => Number(c.id) === id)?.name || `دسته #${id}`;
  };

  // ─── ریست فرم ─────────────────────────────────────────────────────────────
  const resetForm = () => {
    setCategoryId('');
    setAmount('');
    setExpenseDate(todayIso());
    setDescription('');
  };

  // ─── ثبت هزینه ───────────────────────────────────────────────────────────
  const handleCreate = async () => {
    if (!restaurantId || !token || !categoryId || !amount || !expenseDate) return;
    const parsedAmount = parseFormattedNumber(amount);
    if (isNaN(parsedAmount) || parsedAmount <= 0) return;
    setSaving(true);
    try {
      // همیشه اول local ذخیره کن (optimistic)
      const localRow = await createOperationalExpenseLocal({
        restaurantId,
        expenseCategoryId: Number(categoryId),
        fiscalYearId,
        expenseDate,
        amount: parsedAmount,
        description: description.trim() || undefined,
      });
      toast.success('هزینه ثبت شد');
      resetForm();
      setCreateOpen(false);
      // لیست را فوری از local بروز کن
      await reloadLocal();
      // در background به سرور ارسال کن
      if (isOnline) {
        // قبل از شروع درخواست مستقیم، عملیات صف‌شده را از حالت 'pending' خارج کن —
        // وگرنه سینک پس‌زمینه (هر ۳۰ ثانیه یا روی focus/online) ممکن است دقیقاً در
        // همین فاصله همین عملیات را هم پوش کند و روی سرور یک هزینه‌ی تکراری بسازد.
        await markPendingSyncOpsInFlight('operational_expense', String(localRow.id));
        createOperationalExpenseOnline(
          { restaurantId, expenseCategoryId: Number(categoryId), expenseDate, amount: parsedAmount, description: description.trim() || undefined },
          token,
        ).then((serverRow) => {
          // id سرور را جایگزین id محلی کن — سرور id را به صورت رشته برمی‌گرداند
          // (ستون bigint)، این‌جا به number نرمالایزش می‌کنیم وگرنه primary key این
          // رکورد در Dexie با چیزی که بقیه‌ی کد (مثلاً حذف) انتظار دارد یکی نمی‌شود.
          accountingDb.operationalExpenses.delete(localRow.id);
          accountingDb.operationalExpenses.put({ ...serverRow, id: Number(serverRow.id), restaurantId });
          // عملیات صف‌شده برای همین رکورد را پاک کن — وگرنه سینک پس‌زمینه دوباره
          // آن را (با id موقت محلی و بدون fiscalYearId) به سرور می‌فرستد و برای
          // همیشه با خطای «requires expenseCategoryId and fiscalYearId» شکست می‌خورد.
          void cancelPendingSyncOp('operational_expense', String(localRow.id));
          void reloadLocal();
        }).catch(() => {
          // درخواست مستقیم شکست خورد — عملیات صف‌شده را برای تلاش مجدد توسط
          // سینک پس‌زمینه به حالت 'pending' برگردان.
          void restorePendingSyncOps('operational_expense', String(localRow.id));
        });
      }
    } catch (e: any) {
      toast.error(e?.response?.data?.message || 'خطا در ثبت هزینه');
    } finally {
      setSaving(false);
    }
  };

  // ─── ویرایش هزینه ────────────────────────────────────────────────────────
  const handleEdit = async () => {
    if (!restaurantId || !token || !editingRow || !editCategoryId || !editAmount || !editExpenseDate) return;
    const parsedAmount = parseFormattedNumber(editAmount);
    if (isNaN(parsedAmount) || parsedAmount <= 0) return;
    setEditSaving(true);
    try {
      // optimistic: فوری در local آپدیت کن (id را number نرمالایز می‌کنیم — editingRow
      // ممکن است از pull سرور آمده باشد که id را به صورت رشته برمی‌گرداند).
      const editId = Number(editingRow.id);
      const optimistic = {
        ...editingRow,
        id: editId,
        expenseCategoryId: Number(editCategoryId),
        expenseDate: editExpenseDate,
        amount: parsedAmount,
        description: editDescription.trim() || undefined,
        updatedAt: new Date().toISOString(),
      };
      await accountingDb.operationalExpenses.put(optimistic);
      toast.success('هزینه ویرایش شد');
      setEditOpen(false);
      setEditingRow(null);
      await reloadLocal();
      // در background به سرور ارسال کن
      if (isOnline) {
        updateOperationalExpenseOnline(
          editId,
          { restaurantId, expenseCategoryId: Number(editCategoryId), expenseDate: editExpenseDate, amount: parsedAmount, description: editDescription.trim() || undefined },
          token,
        ).then((serverRow) => {
          accountingDb.operationalExpenses.put({ ...serverRow, id: Number(serverRow.id), restaurantId });
          void reloadLocal();
        }).catch(() => { /* sync بعداً انجام می‌شود */ });
      }
    } catch (e: any) {
      toast.error(e?.response?.data?.message || 'خطا در ویرایش هزینه');
    } finally {
      setEditSaving(false);
    }
  };

  // ─── حذف هزینه ───────────────────────────────────────────────────────────
  const handleDelete = async (row: any) => {
    if (!restaurantId || !token) return;
    if (!window.confirm('این هزینه حذف شود؟')) return;
    const id = Number(row.id);
    // فوری از state ری‌اکت هم حذفش کن — مستقل از هر چیزی که در ادامه (Dexie/صف/سرور)
    // پیش بیاید، ردیف باید همین الان از UI محو شود؛ دیگر منتظر reloadLocal نمی‌مانیم.
    setRows((prev) => prev.filter((r) => Number(r.id) !== id));
    toast.success('هزینه حذف شد');
    try {
      // optimistic: از local هم حذف کن + صف‌بندی حذف برای سینک پس‌زمینه (تا اگر
      // الان آفلاین باشیم یا درخواست مستقیم زیر شکست بخورد، حذف گم نشود و pull بعدی
      // همان هزینه را دوباره برنگرداند).
      await deleteOperationalExpenseLocal({ id, restaurantId });
      await reloadLocal();
    } catch (e: any) {
      console.error('[Expenses] deleteOperationalExpenseLocal failed:', e);
      toast.error(e?.message || 'خطا در حذف محلی هزینه — لطفاً صفحه را رفرش کنید');
      await reloadLocal();
      return;
    }
    // در background از سرور هم حذف کن
    if (isOnline) {
      await markPendingSyncOpsInFlight('operational_expense', String(id));
      deleteOperationalExpenseOnline(id, restaurantId, token)
        .then(() => {
          void cancelPendingSyncOp('operational_expense', String(id));
        })
        .catch(() => {
          void restorePendingSyncOps('operational_expense', String(id));
        });
    }
  };

  // ─── UI ──────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-background p-6 space-y-4">

      {/* هدر */}
      <div className="flex justify-between items-center">
        <div className="flex items-center gap-2">
          <h1 className="text-xl font-bold">ثبت هزینه‌ها</h1>
          <span
            className={`text-xs rounded-full px-2 py-0.5 font-medium ${
              isOnline
                ? 'bg-success-soft text-success-soft-foreground'
                : 'bg-default text-muted'
            }`}
          >
            {isOnline ? '● آنلاین' : '○ آفلاین'}
          </span>
        </div>
        <div className="flex gap-2">
          <Button variant="flat" onPress={() => navigate('/accounting')}>بازگشت</Button>
          <Button variant="flat" color="secondary" onPress={() => navigate('/accounting/expense-categories')}>دسته‌بندی هزینه‌ها</Button>
          <Button color="primary" onPress={() => { resetForm(); setCreateOpen(true); }}>
            ثبت هزینه
          </Button>
        </div>
      </div>

      {/* هشدار: دسته تعریف نشده */}
      {categories.length === 0 && (
        <div className="bg-warning-soft border border-warning/30 rounded-lg p-3 text-sm text-warning-soft-foreground flex items-center justify-between gap-3">
          <span>⚠️ هنوز دسته‌بندی هزینه تعریف نشده است.</span>
          <Button
            size="sm"
            color="warning"
            variant="flat"
            onPress={() => navigate('/accounting/expense-categories')}
          >
            ثبت دسته‌بندی
          </Button>
        </div>
      )}

      {/* هشدار: سال مالی انتخاب نشده */}
      {isOnline && !fiscalYearId && (
        <div className="bg-default-soft border border-border rounded-lg p-3 text-sm text-foreground/70">
          ℹ️ سال مالی انتخاب نشده — لیست بر اساس سال مالی فعال سرور نمایش داده می‌شود.
        </div>
      )}

      {/* لیست */}
      <Card>
        <CardContent className="gap-3">
          <div className="flex gap-2">
            <Input
              placeholder="جستجو (دسته / شرح / تاریخ)"
              value={search}
              onValueChange={setSearch}
              className="flex-1"
            />
            <Button size="sm" variant="flat" onPress={() => void reload()}>
              بارگذاری
            </Button>
          </div>

          {loading && (
            <p className="text-center text-sm text-muted py-6 animate-pulse">
              در حال بارگذاری...
            </p>
          )}

          {!loading && filtered.length === 0 && (
            <p className="text-center text-sm text-muted py-6">
              هزینه‌ای ثبت نشده است.
            </p>
          )}

          {!loading && filtered.map((e) => (
            <div
              key={e.id}
              className="bg-default-soft border border-border rounded-lg p-3 text-sm"
            >
              <div className="flex justify-between items-start gap-2">
                <div className="space-y-1 min-w-0">
                  <div className="font-semibold text-foreground">
                    {formatAmount(e.amount)} ریال
                  </div>
                  <div className="text-muted text-xs">
                    دسته: {categoryName(e)}
                  </div>
                  {e.description && (
                    <div className="text-foreground/70 text-xs truncate">{e.description}</div>
                  )}
                </div>
                <div className="flex flex-col items-end gap-1.5 shrink-0">
                  <div className="text-xs text-muted whitespace-nowrap">
                    {toShamsiDate(String(e.expenseDate || '').slice(0, 10))}
                  </div>
                  {isOnline && (
                    <div className="flex gap-1">
                      <Button
                        size="sm"
                        variant="flat"
                        onPress={() => {
                          setEditingRow(e);
                          setEditCategoryId(String(e.expenseCategory?.id || e.expenseCategoryId || ''));
                          setEditAmount(String(e.amount || ''));
                          setEditExpenseDate(String(e.expenseDate || '').slice(0, 10) || todayIso());
                          setEditDescription(e.description || '');
                          setEditOpen(true);
                        }}
                      >
                        ویرایش
                      </Button>
                      <Button
                        size="sm"
                        color="danger"
                        variant="light"
                        onPress={() => void handleDelete(e)}
                      >
                        حذف
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* ─── مودال ثبت ─────────────────────────────────────────────────────── */}
      <Modal isOpen={createOpen} onOpenChange={setCreateOpen}>
        <ModalShell size="md">
          <ModalHeader>ثبت هزینه جدید</ModalHeader>
          <ModalBody className="gap-4">
            <Select
              label="دسته‌بندی هزینه (اجباری)"
              selectedKeys={categoryId ? [categoryId] : []}
              onSelectionChange={(k) => setCategoryId(String(Array.from(k)[0] || ''))}
              isRequired
            >
              {categoryTreeOptions.map((c) => (
                <SelectItem key={String(c.id)}>{`${'— '.repeat(c.depth)}${c.name}`}</SelectItem>
              ))}
            </Select>
            <Input
              label="مبلغ (ریال)"
              value={formatPriceInput(amount)}
              onValueChange={(v) => setAmount(v === '' ? '' : String(parseFormattedNumber(v)))}
              isRequired
            />
            <ShamsiDatePicker
              label="تاریخ هزینه"
              value={expenseDate}
              onChange={setExpenseDate}
              isRequired
            />
            <Input
              label="شرح (اختیاری)"
              value={description}
              onValueChange={setDescription}
              placeholder="توضیح مختصر…"
            />
          </ModalBody>
          <ModalFooter>
            <Button variant="flat" onPress={() => setCreateOpen(false)}>انصراف</Button>
            <Button
              color="primary"
              isLoading={saving}
              isDisabled={!categoryId || !amount || Number(amount) <= 0 || !expenseDate}
              onPress={handleCreate}
            >
              ثبت
            </Button>
          </ModalFooter>
        </ModalShell>
      </Modal>

      {/* ─── مودال ویرایش ──────────────────────────────────────────────────── */}
      <Modal isOpen={editOpen} onOpenChange={setEditOpen}>
        <ModalShell size="md">
          <ModalHeader>ویرایش هزینه</ModalHeader>
          <ModalBody className="gap-4">
            <Select
              label="دسته‌بندی هزینه"
              selectedKeys={editCategoryId ? [editCategoryId] : []}
              onSelectionChange={(k) => setEditCategoryId(String(Array.from(k)[0] || ''))}
              isRequired
            >
              {categoryTreeOptions.map((c) => (
                <SelectItem key={String(c.id)}>{`${'— '.repeat(c.depth)}${c.name}`}</SelectItem>
              ))}
            </Select>
            <Input
              label="مبلغ (ریال)"
              value={formatPriceInput(editAmount)}
              onValueChange={(v) => setEditAmount(v === '' ? '' : String(parseFormattedNumber(v)))}
              isRequired
            />
            <ShamsiDatePicker
              label="تاریخ هزینه"
              value={editExpenseDate}
              onChange={setEditExpenseDate}
              isRequired
            />
            <Input
              label="شرح (اختیاری)"
              value={editDescription}
              onValueChange={setEditDescription}
              placeholder="توضیح مختصر…"
            />
          </ModalBody>
          <ModalFooter>
            <Button variant="flat" onPress={() => setEditOpen(false)}>انصراف</Button>
            <Button
              color="primary"
              isLoading={editSaving}
              isDisabled={!editCategoryId || !editAmount || Number(editAmount) <= 0 || !editExpenseDate}
              onPress={handleEdit}
            >
              ذخیره
            </Button>
          </ModalFooter>
        </ModalShell>
      </Modal>

    </div>
  );
}
