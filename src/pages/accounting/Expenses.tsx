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
  createOperationalExpenseLocal,
  listExpenseCategoriesLocal,
} from '../../services/accountingLocalDb';
import {
  listExpenseCategories,
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

  const { selectedByRestaurant } = useFiscalYearStore();
  const fiscalYearId = restaurantId ? selectedByRestaurant[restaurantId] : undefined;

  const [rows, setRows] = useState<any[]>([]);
  const [categories, setCategories] = useState<ExpenseCategoryRow[]>([]);
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

  // ─── بارگذاری ────────────────────────────────────────────────────────────
  const reload = useCallback(async () => {
    if (!restaurantId || !token) return;
    setLoading(true);
    try {
      // اول سرور — اگر آنلاین باشد
      const serverRows = await listOperationalExpensesOnline(restaurantId, token, fiscalYearId);
      setIsOnline(true);
      setRows(
        [...serverRows].sort((a, b) =>
          String(b.expenseDate).localeCompare(String(a.expenseDate)),
        ),
      );
    } catch {
      // آفلاین — دیکسی محلی
      setIsOnline(false);
      const all = await accountingDb.operationalExpenses.toArray();
      setRows(
        all
          .filter((x) => Number(x.restaurantId) === restaurantId)
          .sort((a, b) => String(b.expenseDate).localeCompare(String(a.expenseDate))),
      );
    } finally {
      setLoading(false);
    }
  }, [restaurantId, token, fiscalYearId]);

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
    const parsedAmount = Number(String(amount).replace(/,/g, ''));
    if (isNaN(parsedAmount) || parsedAmount <= 0) return;
    setSaving(true);
    try {
      if (isOnline) {
        // آنلاین: مستقیم روی سرور
        await createOperationalExpenseOnline(
          {
            restaurantId,
            expenseCategoryId: Number(categoryId),
            expenseDate,
            amount: parsedAmount,
            description: description.trim() || undefined,
          },
          token,
        );
      } else {
        // آفلاین: صف محلی
        await createOperationalExpenseLocal({
          restaurantId,
          expenseCategoryId: Number(categoryId),
          expenseDate,
          amount: parsedAmount,
          description: description.trim() || undefined,
        });
      }
      toast.success('هزینه ثبت شد');
      resetForm();
      setCreateOpen(false);
      await reload();
    } catch (e: any) {
      toast.error(e?.response?.data?.message || 'خطا در ثبت هزینه');
    } finally {
      setSaving(false);
    }
  };

  // ─── ویرایش هزینه ────────────────────────────────────────────────────────
  const handleEdit = async () => {
    if (!restaurantId || !token || !editingRow || !editCategoryId || !editAmount || !editExpenseDate) return;
    const parsedAmount = Number(String(editAmount).replace(/,/g, ''));
    if (isNaN(parsedAmount) || parsedAmount <= 0) return;
    setEditSaving(true);
    try {
      await updateOperationalExpenseOnline(
        Number(editingRow.id),
        {
          restaurantId,
          expenseCategoryId: Number(editCategoryId),
          expenseDate: editExpenseDate,
          amount: parsedAmount,
          description: editDescription.trim() || undefined,
        },
        token,
      );
      toast.success('هزینه ویرایش شد');
      setEditOpen(false);
      setEditingRow(null);
      await reload();
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
    try {
      await deleteOperationalExpenseOnline(Number(row.id), restaurantId, token);
      toast.success('هزینه حذف شد');
      await reload();
    } catch (e: any) {
      toast.error(e?.response?.data?.message || 'خطا در حذف هزینه');
    }
  };

  // ─── UI ──────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-default-100 p-6 space-y-4">

      {/* هدر */}
      <div className="flex justify-between items-center">
        <div className="flex items-center gap-2">
          <h1 className="text-xl font-bold">ثبت هزینه‌ها</h1>
          <span
            className={`text-xs rounded-full px-2 py-0.5 font-medium ${
              isOnline
                ? 'bg-success-100 text-success-700'
                : 'bg-default-200 text-default-500'
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
        <div className="bg-warning-50 border border-warning-200 rounded-lg p-3 text-sm text-warning-700 flex items-center justify-between gap-3">
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
        <div className="bg-default-100 border border-default-200 rounded-lg p-3 text-sm text-default-600">
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
            <p className="text-center text-sm text-default-400 py-6 animate-pulse">
              در حال بارگذاری...
            </p>
          )}

          {!loading && filtered.length === 0 && (
            <p className="text-center text-sm text-default-500 py-6">
              هزینه‌ای ثبت نشده است.
            </p>
          )}

          {!loading && filtered.map((e) => (
            <div
              key={e.id}
              className="bg-default-50 border border-default-200 rounded-lg p-3 text-sm"
            >
              <div className="flex justify-between items-start gap-2">
                <div className="space-y-1 min-w-0">
                  <div className="font-semibold text-foreground">
                    {formatAmount(e.amount)} ریال
                  </div>
                  <div className="text-default-500 text-xs">
                    دسته: {categoryName(e)}
                  </div>
                  {e.description && (
                    <div className="text-default-600 text-xs truncate">{e.description}</div>
                  )}
                </div>
                <div className="flex flex-col items-end gap-1.5 shrink-0">
                  <div className="text-xs text-default-400 whitespace-nowrap">
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
              {categories.map((c) => (
                <SelectItem key={String(c.id)}>{c.name}</SelectItem>
              ))}
            </Select>
            <Input
              type="number"
              label="مبلغ (ریال)"
              value={amount}
              onValueChange={setAmount}
              isRequired
              min={1}
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
              {categories.map((c) => (
                <SelectItem key={String(c.id)}>{c.name}</SelectItem>
              ))}
            </Select>
            <Input
              type="number"
              label="مبلغ (ریال)"
              value={editAmount}
              onValueChange={setEditAmount}
              isRequired
              min={1}
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
