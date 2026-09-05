import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, Modal, ModalBody, ModalFooter, ModalHeader } from '@heroui/react';
import { Button } from '../../ui/compat-button';
import { Input } from '../../ui/compat-input';
import { Select, SelectItem } from '../../ui/compat-select';
import { ModalShell } from '../../ui/modal-shell';
import { useAuthStore } from '../../store/authStore';
import {
  listExpenseCategories,
  createExpenseCategory,
  updateExpenseCategory,
  deleteExpenseCategory,
  ExpenseCategoryRow,
} from '../../services/api';
import {
  accountingDb,
  cancelPendingSyncOp,
  listExpenseCategoriesLocal,
  createExpenseCategoryLocal,
  updateExpenseCategoryLocal,
  deleteExpenseCategoryLocal,
  upsertPulledExpenseCategories,
} from '../../services/accountingLocalDb';
import { toast } from '../../utils/toast';

const NONE_PARENT = '__none__';

/** دسته‌های تخت را به ترتیب درختی (والد قبل از فرزندانش) با فیلد depth مرتب می‌کند. */
function sortAsTree(rows: ExpenseCategoryRow[]): Array<ExpenseCategoryRow & { depth: number }> {
  const byParent = new Map<number | null, ExpenseCategoryRow[]>();
  rows.forEach((r) => {
    const key = r.parentCategoryId ?? null;
    if (!byParent.has(key)) byParent.set(key, []);
    byParent.get(key)!.push(r);
  });
  const result: Array<ExpenseCategoryRow & { depth: number }> = [];
  const visited = new Set<number>();
  const walk = (parentId: number | null, depth: number) => {
    (byParent.get(parentId) || []).forEach((r) => {
      if (visited.has(r.id)) return;
      visited.add(r.id);
      result.push({ ...r, depth });
      walk(r.id, depth + 1);
    });
  };
  walk(null, 0);
  rows.forEach((r) => { if (!visited.has(r.id)) result.push({ ...r, depth: 0 }); });
  return result;
}

export default function AccountingExpenseCategoriesPage() {
  const navigate = useNavigate();
  const { user, token } = useAuthStore();
  const restaurantId = user?.restaurants?.[0]?.id ? Number(user.restaurants[0].id) : undefined;

  const [rows, setRows] = useState<ExpenseCategoryRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [isOnline, setIsOnline] = useState(false);

  const [createOpen, setCreateOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const [newParentId, setNewParentId] = useState<string>(NONE_PARENT);
  const [saving, setSaving] = useState(false);

  const [editOpen, setEditOpen] = useState(false);
  const [editRow, setEditRow] = useState<ExpenseCategoryRow | null>(null);
  const [editName, setEditName] = useState('');
  const [editParentId, setEditParentId] = useState<string>(NONE_PARENT);

  const treeRows = useMemo(() => sortAsTree(rows), [rows]);

  /** گزینه‌های دستهٔ والد — هنگام ویرایش، خود دسته و نوادگانش حذف می‌شوند تا چرخه ساخته نشود. */
  const parentOptionsFor = (excludeId: number | null) => {
    const excluded = new Set<number>();
    if (excludeId != null) {
      const collectDescendants = (id: number) => {
        excluded.add(id);
        rows.filter((r) => Number(r.parentCategoryId) === id).forEach((r) => collectDescendants(r.id));
      };
      collectDescendants(excludeId);
    }
    return sortAsTree(rows.filter((r) => !excluded.has(r.id)));
  };

  const reload = async () => {
    if (!restaurantId || !token) return;
    setLoading(true);
    // اول local را فوری نمایش بده
    const local = await listExpenseCategoriesLocal(restaurantId);
    if (local.length) setRows(local);
    setLoading(false);
    // بعد از سرور sync کن
    try {
      const data = await listExpenseCategories(restaurantId, token);
      setIsOnline(true);
      await upsertPulledExpenseCategories(data);
      setRows(data);
    } catch {
      setIsOnline(false);
      if (!local.length) setRows([]);
    }
  };

  useEffect(() => {
    void reload();
  }, [restaurantId, token]);

  const handleCreate = async () => {
    if (!restaurantId || !token || !newName.trim()) return;
    setSaving(true);
    const parentCategoryId = newParentId === NONE_PARENT ? null : Number(newParentId);
    try {
      // optimistic: همیشه اول local ذخیره کن
      const localRow = await createExpenseCategoryLocal({ restaurantId, name: newName.trim(), parentCategoryId });
      toast.success('دسته‌بندی ثبت شد');
      setNewName('');
      setNewParentId(NONE_PARENT);
      setCreateOpen(false);
      setRows((prev) => [...prev, localRow]);
      // در background به سرور ارسال کن
      if (isOnline) {
        createExpenseCategory({ restaurantId, name: newName.trim(), parentCategoryId }, token)
          .then((serverRow) => {
            accountingDb.expenseCategories.delete(localRow.id);
            accountingDb.expenseCategories.put({ ...serverRow, restaurantId });
            setRows((prev) => prev.map((r) => r.id === localRow.id ? { ...serverRow, restaurantId } : r));
            // عملیات صف‌شده برای همین رکورد را پاک کن — وگرنه سینک پس‌زمینه دوباره
            // آن را با id موقت محلی به سرور می‌فرستد و یک دسته‌بندی تکراری واقعی
            // می‌سازد که قابل حذف از این صفحه هم نیست (چون UI فقط رکورد اصلی را می‌شناسد).
            void cancelPendingSyncOp('expense_category', String(localRow.id));
          }).catch(() => {});
      }
    } catch {
      toast.error('خطا در ثبت دسته‌بندی');
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = async () => {
    if (!editRow || !restaurantId || !token || !editName.trim()) return;
    setSaving(true);
    const parentCategoryId = editParentId === NONE_PARENT ? null : Number(editParentId);
    try {
      // optimistic: فوری در local و UI آپدیت کن
      await updateExpenseCategoryLocal({ id: editRow.id, restaurantId, patch: { name: editName.trim(), parentCategoryId } });
      toast.success('دسته‌بندی ویرایش شد');
      setRows((prev) => prev.map((r) => r.id === editRow.id ? { ...r, name: editName.trim(), parentCategoryId } : r));
      setEditOpen(false);
      setEditRow(null);
      if (isOnline) {
        updateExpenseCategory(editRow.id, { restaurantId, name: editName.trim(), parentCategoryId }, token)
          .then((serverRow) => {
            accountingDb.expenseCategories.put({ ...serverRow, restaurantId });
            setRows((prev) => prev.map((r) => r.id === editRow.id ? { ...serverRow, restaurantId } : r));
            void cancelPendingSyncOp('expense_category', String(editRow.id));
          }).catch(() => {});
      }
    } catch (error: any) {
      toast.error(error?.response?.data?.message || 'خطا در ویرایش دسته‌بندی');
    } finally {
      setSaving(false);
    }
  };

  const handleToggleActive = async (row: ExpenseCategoryRow) => {
    if (!restaurantId || !token) return;
    // optimistic: فوری در UI تغییر بده
    const newActive = !row.isActive;
    setRows((prev) => prev.map((r) => r.id === row.id ? { ...r, isActive: newActive } : r));
    try {
      await updateExpenseCategoryLocal({ id: row.id, restaurantId, patch: { isActive: newActive } });
      toast.success(newActive ? 'فعال شد' : 'غیرفعال شد');
      if (isOnline) {
        updateExpenseCategory(row.id, { restaurantId, isActive: newActive }, token)
          .then((serverRow) => {
            accountingDb.expenseCategories.put({ ...serverRow, restaurantId });
            setRows((prev) => prev.map((r) => r.id === row.id ? { ...serverRow, restaurantId } : r));
            void cancelPendingSyncOp('expense_category', String(row.id));
          }).catch(() => {});
      }
    } catch {
      // rollback
      setRows((prev) => prev.map((r) => r.id === row.id ? { ...r, isActive: row.isActive } : r));
      toast.error('خطا در تغییر وضعیت');
    }
  };

  const handleDelete = async (row: ExpenseCategoryRow) => {
    if (!restaurantId || !token) return;
    if (!window.confirm(`دسته‌بندی «${row.name}» حذف شود؟`)) return;

    if (isOnline) {
      // آنلاین: اول از سرور حذف کن. اگر سرور رد کرد (مثلاً هزینه‌ای به این دسته
      // متصل است)، خطای واقعی را نشان بده و UI/local را دست‌نخورده نگه دار —
      // در غیر این صورت دسته از Electron ناپدید می‌شد ولی در وب هنوز وجود داشت.
      try {
        await deleteExpenseCategory(row.id, restaurantId, token);
      } catch (error: any) {
        toast.error(error?.response?.data?.message || 'خطا در حذف دسته‌بندی');
        return;
      }
      setRows((prev) => prev.filter((r) => r.id !== row.id));
      await accountingDb.expenseCategories.delete(row.id);
      toast.success('دسته‌بندی حذف شد');
      return;
    }

    // آفلاین: optimistic حذف محلی + صف sync برای پس از اتصال
    setRows((prev) => prev.filter((r) => r.id !== row.id));
    try {
      await deleteExpenseCategoryLocal({ id: row.id, restaurantId });
      toast.success('دسته‌بندی حذف شد — پس از اتصال همگام می‌شود');
    } catch {
      // rollback
      setRows((prev) => [...prev, row]);
      toast.error('خطا در حذف دسته‌بندی');
    }
  };

  return (
    <div className="min-h-screen bg-default-100 p-6 space-y-4">
      <div className="flex justify-between items-center">
        <div className="flex items-center gap-2">
          <h1 className="text-xl font-bold">دسته‌بندی هزینه‌ها</h1>
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
          <Button variant="flat" onPress={() => navigate('/accounting/expenses')}>
            بازگشت
          </Button>
          <Button
            color="primary"
            onPress={() => {
              setNewName('');
              setNewParentId(NONE_PARENT);
              setCreateOpen(true);
            }}
          >
            دسته‌بندی جدید
          </Button>
        </div>
      </div>

      {!isOnline && (
        <div className="bg-warning-50 border border-warning-200 rounded-lg p-3 text-sm text-warning-700">
          اتصال به سرور برقرار نیست — تغییرات ذخیره می‌شوند و پس از برقراری اتصال همگام‌سازی خواهند شد.
        </div>
      )}

      <Card>
        <CardContent className="gap-3">
          {loading && (
            <p className="text-center text-sm text-default-500 py-6 animate-pulse">در حال بارگذاری...</p>
          )}

          {!loading && rows.length === 0 && (
            <p className="text-center text-sm text-default-500 py-6">
              هنوز دسته‌بندی تعریف نشده است.
            </p>
          )}

          {treeRows.map((row) => (
            <div
              key={row.id}
              className="bg-default-50 border border-default-200 rounded-lg p-3 text-sm flex justify-between items-center"
              style={{ marginInlineStart: `${row.depth * 1.5}rem` }}
            >
              <div className="flex items-center gap-2">
                <span className="font-medium">{row.name}</span>
                {!row.isActive && (
                  <span className="text-xs bg-default-200 text-default-500 rounded px-1.5 py-0.5">
                    غیرفعال
                  </span>
                )}
              </div>
              <div className="flex gap-1">
                <Button
                  size="sm"
                  variant="flat"
                  onPress={() => {
                    setEditRow(row);
                    setEditName(row.name);
                    setEditParentId(row.parentCategoryId != null ? String(row.parentCategoryId) : NONE_PARENT);
                    setEditOpen(true);
                  }}
                >
                  ویرایش
                </Button>
                <Button
                  size="sm"
                  variant="flat"
                  color={row.isActive ? 'warning' : 'success'}
                  onPress={() => void handleToggleActive(row)}
                >
                  {row.isActive ? 'غیرفعال' : 'فعال'}
                </Button>
                <Button
                  size="sm"
                  color="danger"
                  variant="light"
                  onPress={() => void handleDelete(row)}
                >
                  حذف
                </Button>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      <Modal isOpen={createOpen} onOpenChange={setCreateOpen}>
        <ModalShell size="sm">
          <ModalHeader>دسته‌بندی جدید</ModalHeader>
          <ModalBody className="gap-3">
            <Input
              label="نام دسته‌بندی"
              value={newName}
              onValueChange={setNewName}
              isRequired
              autoFocus
            />
            <Select
              label="دسته والد (اختیاری)"
              selectedKeys={[newParentId]}
              onSelectionChange={(k) => setNewParentId(String(Array.from(k)[0] || NONE_PARENT))}
            >
              <SelectItem key={NONE_PARENT}>بدون والد (دستهٔ اصلی)</SelectItem>
              {parentOptionsFor(null).map((c) => (
                <SelectItem key={String(c.id)}>{`${'— '.repeat(c.depth)}${c.name}`}</SelectItem>
              ))}
            </Select>
          </ModalBody>
          <ModalFooter>
            <Button variant="flat" onPress={() => setCreateOpen(false)}>
              انصراف
            </Button>
            <Button
              color="primary"
              isLoading={saving}
              isDisabled={!newName.trim()}
              onPress={handleCreate}
            >
              ثبت
            </Button>
          </ModalFooter>
        </ModalShell>
      </Modal>

      <Modal isOpen={editOpen} onOpenChange={setEditOpen}>
        <ModalShell size="sm">
          <ModalHeader>ویرایش دسته‌بندی</ModalHeader>
          <ModalBody className="gap-3">
            <Input
              label="نام جدید"
              value={editName}
              onValueChange={setEditName}
              isRequired
              autoFocus
            />
            <Select
              label="دسته والد (اختیاری)"
              selectedKeys={[editParentId]}
              onSelectionChange={(k) => setEditParentId(String(Array.from(k)[0] || NONE_PARENT))}
            >
              <SelectItem key={NONE_PARENT}>بدون والد (دستهٔ اصلی)</SelectItem>
              {parentOptionsFor(editRow?.id ?? null).map((c) => (
                <SelectItem key={String(c.id)}>{`${'— '.repeat(c.depth)}${c.name}`}</SelectItem>
              ))}
            </Select>
          </ModalBody>
          <ModalFooter>
            <Button variant="flat" onPress={() => setEditOpen(false)}>
              انصراف
            </Button>
            <Button
              color="primary"
              isLoading={saving}
              isDisabled={!editName.trim()}
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
