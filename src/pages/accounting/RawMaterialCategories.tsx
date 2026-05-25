import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, Modal, ModalBody, ModalFooter, ModalHeader } from '@heroui/react';
import { Button } from '../../ui/compat-button';
import { Input } from '../../ui/compat-input';
import { ModalShell } from '../../ui/modal-shell';
import { useAuthStore } from '../../store/authStore';
import {
  listRawMaterialCategories,
  createRawMaterialCategory,
  updateRawMaterialCategory,
  deleteRawMaterialCategory,
  RawMaterialCategoryRow,
} from '../../services/api';
import { toast } from '../../utils/toast';

export default function AccountingRawMaterialCategoriesPage() {
  const navigate = useNavigate();
  const { user, token } = useAuthStore();
  const restaurantId = user?.restaurants?.[0]?.id ? Number(user.restaurants[0].id) : undefined;

  const [rows, setRows] = useState<RawMaterialCategoryRow[]>([]);
  const [loading, setLoading] = useState(false);

  // مودال ایجاد
  const [createOpen, setCreateOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const [saving, setSaving] = useState(false);

  // مودال ویرایش
  const [editOpen, setEditOpen] = useState(false);
  const [editRow, setEditRow] = useState<RawMaterialCategoryRow | null>(null);
  const [editName, setEditName] = useState('');

  const reload = async () => {
    if (!restaurantId || !token) return;
    setLoading(true);
    try {
      const data = await listRawMaterialCategories(restaurantId, token);
      setRows(data);
    } catch {
      toast.error('خطا در دریافت دسته‌بندی‌ها');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void reload();
  }, [restaurantId, token]);

  const handleCreate = async () => {
    if (!restaurantId || !token || !newName.trim()) return;
    setSaving(true);
    try {
      await createRawMaterialCategory({ restaurantId, name: newName.trim() }, token);
      toast.success('دسته‌بندی ثبت شد');
      setNewName('');
      setCreateOpen(false);
      await reload();
    } catch {
      toast.error('خطا در ثبت دسته‌بندی');
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = async () => {
    if (!editRow || !token || !editName.trim()) return;
    setSaving(true);
    try {
      await updateRawMaterialCategory(editRow.id, { name: editName.trim() }, token);
      toast.success('دسته‌بندی ویرایش شد');
      setEditOpen(false);
      setEditRow(null);
      await reload();
    } catch {
      toast.error('خطا در ویرایش دسته‌بندی');
    } finally {
      setSaving(false);
    }
  };

  const handleToggleActive = async (row: RawMaterialCategoryRow) => {
    if (!token) return;
    try {
      await updateRawMaterialCategory(row.id, { isActive: !row.isActive }, token);
      toast.success(row.isActive ? 'غیرفعال شد' : 'فعال شد');
      await reload();
    } catch {
      toast.error('خطا در تغییر وضعیت');
    }
  };

  const handleDelete = async (row: RawMaterialCategoryRow) => {
    if (!restaurantId || !token) return;
    if (!window.confirm(`دسته‌بندی «${row.name}» حذف شود؟`)) return;
    try {
      await deleteRawMaterialCategory(row.id, restaurantId, token);
      toast.success('دسته‌بندی حذف شد');
      await reload();
    } catch {
      toast.error('خطا در حذف دسته‌بندی');
    }
  };

  return (
    <div className="min-h-screen bg-default-100 p-6 space-y-4">
      {/* هدر */}
      <div className="flex justify-between items-center">
        <h1 className="text-xl font-bold">دسته‌بندی مواد اولیه</h1>
        <div className="flex gap-2">
          <Button variant="flat" onPress={() => navigate('/accounting/raw-materials')}>
            بازگشت
          </Button>
          <Button
            color="primary"
            onPress={() => {
              setNewName('');
              setCreateOpen(true);
            }}
          >
            دسته‌بندی جدید
          </Button>
        </div>
      </div>

      {/* لیست */}
      <Card>
        <CardContent className="gap-3">
          {loading && (
            <p className="text-center text-sm text-default-500 py-6">در حال بارگذاری...</p>
          )}

          {!loading && rows.length === 0 && (
            <p className="text-center text-sm text-default-500 py-6">
              هنوز دسته‌بندی تعریف نشده است.
            </p>
          )}

          {rows.map((row) => (
            <div
              key={row.id}
              className="bg-default-50 border border-default-200 rounded-lg p-3 text-sm flex justify-between items-center"
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

      {/* مودال ایجاد */}
      <Modal isOpen={createOpen} onOpenChange={setCreateOpen}>
        <ModalShell size="sm">
          <ModalHeader>دسته‌بندی جدید</ModalHeader>
          <ModalBody>
            <Input
              label="نام دسته‌بندی"
              value={newName}
              onValueChange={setNewName}
              isRequired
              autoFocus
            />
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

      {/* مودال ویرایش */}
      <Modal isOpen={editOpen} onOpenChange={setEditOpen}>
        <ModalShell size="sm">
          <ModalHeader>ویرایش دسته‌بندی</ModalHeader>
          <ModalBody>
            <Input
              label="نام جدید"
              value={editName}
              onValueChange={setEditName}
              isRequired
              autoFocus
            />
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
