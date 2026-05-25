import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, Modal, ModalBody, ModalFooter, ModalHeader } from '@heroui/react';
import { Button } from '../../ui/compat-button';
import { Input } from '../../ui/compat-input';
import { ModalShell } from '../../ui/modal-shell';
import { Select, SelectItem } from '../../ui/compat-select';
import { useAuthStore } from '../../store/authStore';
import {
  accountingDb,
  createRawMaterialLocal,
  deleteRawMaterialLocal,
  updateRawMaterialLocal,
} from '../../services/accountingLocalDb';
import { listRawMaterialCategories, RawMaterialCategoryRow } from '../../services/api';
import { toast } from '../../utils/toast';

const UNITS = ['gram', 'kilogram', 'liter', 'milliliter', 'piece', 'pack'];

export default function AccountingRawMaterialsPage() {
  const navigate = useNavigate();
  const { user, token } = useAuthStore();
  // Normalize to number — backend may return bigint as string from PostgreSQL
  const restaurantId = user?.restaurants?.[0]?.id ? Number(user.restaurants[0].id) : undefined;

  const [rows, setRows] = useState<any[]>([]);
  const [categories, setCategories] = useState<RawMaterialCategoryRow[]>([]);
  const [search, setSearch] = useState('');

  // فرم ایجاد
  const [createOpen, setCreateOpen] = useState(false);
  const [name, setName] = useState('');
  const [unit, setUnit] = useState('gram');
  const [minStock, setMinStock] = useState('0');
  const [categoryId, setCategoryId] = useState('');

  // فرم ویرایش
  const [editOpen, setEditOpen] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [editName, setEditName] = useState('');
  const [editCategoryId, setEditCategoryId] = useState('');

  const reload = async () => {
    if (!restaurantId) return;
    const all = await accountingDb.rawMaterials.toArray();
    const filtered = all
      .filter((x) => Number(x.restaurantId) === restaurantId)
      .sort((a, b) => Number(b.id) - Number(a.id));
    setRows(filtered);
  };

  const loadCategories = async () => {
    if (!restaurantId || !token) return;
    try {
      const cats = await listRawMaterialCategories(restaurantId, token);
      setCategories(cats.filter((c) => c.isActive));
    } catch {
      // آفلاین — دسته‌بندی‌ها نمایش داده نمی‌شوند
    }
  };

  useEffect(() => {
    void reload();
    void loadCategories();
  }, [restaurantId, token]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(
      (x) =>
        String(x.name || '').toLowerCase().includes(q) ||
        String(x.barcode || '').includes(q),
    );
  }, [rows, search]);

  const catName = (id: number | null | undefined) => {
    if (!id) return null;
    return categories.find((c) => Number(c.id) === Number(id))?.name ?? `دسته #${id}`;
  };

  const resetCreateForm = () => {
    setName('');
    setUnit('gram');
    setMinStock('0');
    setCategoryId('');
  };

  return (
    <div className="min-h-screen bg-default-100 p-6 space-y-4">
      {/* هدر */}
      <div className="flex justify-between items-center">
        <h1 className="text-xl font-bold">مواد اولیه</h1>
        <div className="flex gap-2">
          <Button
            variant="flat"
            onPress={() => navigate('/accounting/raw-material-categories')}
          >
            دسته‌بندی‌ها
          </Button>
          <Button variant="flat" onPress={() => navigate('/accounting')}>
            بازگشت
          </Button>
          <Button
            color="primary"
            onPress={() => {
              resetCreateForm();
              setCreateOpen(true);
            }}
          >
            ثبت ماده اولیه
          </Button>
        </div>
      </div>

      {/* هشدار دسته‌بندی */}
      {categories.length === 0 && (
        <div className="bg-warning-50 border border-warning-200 rounded-lg p-3 text-sm text-warning-700">
          ⚠️ هنوز دسته‌بندی مواد اولیه تعریف نشده. برای ثبت دسته‌بندی روی «دسته‌بندی‌ها» کلیک کنید.
        </div>
      )}

      {/* لیست */}
      <Card>
        <CardContent className="gap-3">
          <Input placeholder="جستجو (نام/بارکد)" value={search} onValueChange={setSearch} />

          {filtered.length === 0 && (
            <p className="text-center text-sm text-default-500 py-6">
              ماده اولیه‌ای ثبت نشده است.
            </p>
          )}

          {filtered.map((m) => (
            <div
              key={m.id}
              className="text-sm bg-default-50 border border-default-200 rounded-lg p-3 flex justify-between items-center"
            >
              <div className="space-y-0.5">
                <div className="font-medium">{m.name}</div>
                <div className="text-xs text-default-400 flex gap-2">
                  <span>موجودی: {m.currentStock}</span>
                  <span>حداقل: {m.minStock}</span>
                  <span>واحد: {m.unit}</span>
                  {catName(m.rawMaterialCategoryId) && (
                    <span className="text-primary-600">
                      دسته: {catName(m.rawMaterialCategoryId)}
                    </span>
                  )}
                  {!m.rawMaterialCategoryId && (
                    <span className="text-warning-500">بدون دسته</span>
                  )}
                </div>
              </div>
              <div className="flex gap-1 shrink-0">
                <Button
                  size="sm"
                  variant="flat"
                  onPress={() => {
                    setEditId(m.id);
                    setEditName(m.name);
                    setEditCategoryId(m.rawMaterialCategoryId ? String(m.rawMaterialCategoryId) : '');
                    setEditOpen(true);
                  }}
                >
                  ویرایش
                </Button>
                <Button
                  size="sm"
                  color="danger"
                  variant="light"
                  onPress={async () => {
                    if (!restaurantId) return;
                    await deleteRawMaterialLocal({ id: m.id, restaurantId });
                    await reload();
                  }}
                >
                  حذف
                </Button>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* مودال ثبت */}
      <Modal isOpen={createOpen} onOpenChange={setCreateOpen}>
        <ModalShell size="md">
          <ModalHeader>ثبت ماده اولیه</ModalHeader>
          <ModalBody className="gap-3">
            <Input label="نام" value={name} onValueChange={setName} isRequired />
            <Select
              label="واحد"
              selectedKeys={[unit]}
              onSelectionChange={(k) => setUnit(String(Array.from(k)[0] || 'gram'))}
            >
              {UNITS.map((u) => (
                <SelectItem key={u}>{u}</SelectItem>
              ))}
            </Select>
            <Select
              label="دسته‌بندی (اجباری)"
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
              label="حداقل موجودی"
              value={minStock}
              onValueChange={setMinStock}
            />
          </ModalBody>
          <ModalFooter>
            <Button variant="flat" onPress={() => setCreateOpen(false)}>
              انصراف
            </Button>
            <Button
              color="primary"
              isDisabled={!name.trim() || !categoryId}
              onPress={async () => {
                if (!restaurantId || !name.trim() || !categoryId) return;
                try {
                  await createRawMaterialLocal({
                    restaurantId,
                    name: name.trim(),
                    unit,
                    minStock: Number(minStock || 0),
                    currentStock: 0,
                    rawMaterialCategoryId: Number(categoryId),
                  });
                  toast.success('ماده اولیه ثبت شد');
                  resetCreateForm();
                  setCreateOpen(false);
                  await reload();
                } catch {
                  toast.error('خطا در ثبت ماده اولیه');
                }
              }}
            >
              ثبت
            </Button>
          </ModalFooter>
        </ModalShell>
      </Modal>

      {/* مودال ویرایش */}
      <Modal isOpen={editOpen} onOpenChange={setEditOpen}>
        <ModalShell size="md">
          <ModalHeader>ویرایش ماده اولیه</ModalHeader>
          <ModalBody className="gap-3">
            <Input label="نام جدید" value={editName} onValueChange={setEditName} isRequired />
            <Select
              label="دسته‌بندی"
              selectedKeys={editCategoryId ? [editCategoryId] : []}
              onSelectionChange={(k) => setEditCategoryId(String(Array.from(k)[0] || ''))}
            >
              {categories.map((c) => (
                <SelectItem key={String(c.id)}>{c.name}</SelectItem>
              ))}
            </Select>
          </ModalBody>
          <ModalFooter>
            <Button variant="flat" onPress={() => setEditOpen(false)}>
              انصراف
            </Button>
            <Button
              color="primary"
              isDisabled={!editName.trim()}
              onPress={async () => {
                if (!restaurantId || !editId || !editName.trim()) return;
                try {
                  await updateRawMaterialLocal({
                    id: editId,
                    restaurantId,
                    patch: {
                      name: editName.trim(),
                      rawMaterialCategoryId: editCategoryId ? Number(editCategoryId) : null,
                    },
                  });
                  toast.success('ماده اولیه ویرایش شد');
                  setEditOpen(false);
                  await reload();
                } catch {
                  toast.error('خطا در ویرایش');
                }
              }}
            >
              ذخیره
            </Button>
          </ModalFooter>
        </ModalShell>
      </Modal>
    </div>
  );
}
