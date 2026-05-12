import { useEffect, useMemo, useState } from 'react';
import { Card, CardContent, Modal, ModalBody, ModalFooter, ModalHeader } from '@heroui/react';
import { Button } from '../ui/compat-button';
import { Input } from '../ui/compat-input';
import { ModalShell } from '../ui/modal-shell';
import { useAuthStore } from '../store/authStore';
import { createCategory, getCategories, updateCategoryById } from '../services/api';

type CategoryForm = {
  id?: number;
  name_fa: string;
  name: string;
  description: string;
};

const emptyForm: CategoryForm = {
  name_fa: '',
  name: '',
  description: '',
};

export default function CategoriesPage() {
  const { user, token } = useAuthStore();
  const restaurantName = user?.restaurants?.[0]?.name;
  const restaurantId = user?.restaurants?.[0]?.id;
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState<CategoryForm>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  const loadData = async () => {
    if (!token) return;
    setLoading(true);
    try {
      const c = await getCategories(restaurantName, restaurantId, token);
      setRows(c);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadData();
  }, [token, restaurantId]);

  const openCreate = () => {
    setForm(emptyForm);
    setModalOpen(true);
  };

  const openEdit = (row: any) => {
    setForm({
      id: Number(row.id),
      name_fa: String(row?.name_fa || ''),
      name: String(row?.name || ''),
      description: String(row?.description || ''),
    });
    setModalOpen(true);
  };

  const submit = async () => {
    if (!token) return;
    if (!form.name_fa.trim()) {
      setMessage('نام فارسی دسته‌بندی الزامی است');
      return;
    }
    setSaving(true);
    try {
      if (form.id) {
        await updateCategoryById(
          form.id,
          {
            name_fa: form.name_fa.trim(),
            name: form.name.trim() || undefined,
            description: form.description.trim() || undefined,
          },
          token,
        );
        setMessage('دسته‌بندی ویرایش شد');
      } else {
        await createCategory(
          {
            name_fa: form.name_fa.trim(),
            name: form.name.trim() || undefined,
            description: form.description.trim() || undefined,
            restaurantId: restaurantId ? Number(restaurantId) : undefined,
          },
          token,
        );
        setMessage('دسته‌بندی جدید ثبت شد');
      }
      setModalOpen(false);
      await loadData();
    } catch (e: any) {
      setMessage(e?.response?.data?.message || e?.message || 'خطا در ذخیره دسته‌بندی');
    } finally {
      setSaving(false);
    }
  };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((c) =>
      String(c?.name_fa || '').toLowerCase().includes(q) ||
      String(c?.name || '').toLowerCase().includes(q),
    );
  }, [rows, search]);

  return (
    <div className="min-h-screen bg-default-100">
      <header className="shrink-0 bg-content1 border-b border-default-200 px-4 py-3 shadow-sm">
        <h1 className="text-lg sm:text-xl font-bold">مدیریت دسته‌بندی‌ها</h1>
      </header>
      <div className="p-6 max-w-5xl mx-auto space-y-4">
        <Card>
          <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <Input label="جستجو" placeholder="نام دسته‌بندی" value={search} onValueChange={setSearch} />
            <Button color="primary" onPress={openCreate}>افزودن دسته‌بندی جدید</Button>
          </CardContent>
        </Card>
        {message ? <p className="text-sm text-default-600">{message}</p> : null}
        <Card>
          <CardContent className="space-y-2">
            {loading ? (
              <p className="text-default-500">در حال بارگذاری...</p>
            ) : filtered.length === 0 ? (
              <p className="text-default-500">دسته‌بندی‌ای یافت نشد.</p>
            ) : (
              filtered.map((c) => (
                <div key={c.id} className="flex items-center justify-between rounded-lg border border-default-200 p-3">
                  <div>
                    <div className="font-semibold">{c.name_fa || c.name}</div>
                    <div className="text-xs text-default-500">{c.description || '—'}</div>
                  </div>
                  <Button size="sm" variant="flat" color="primary" onPress={() => openEdit(c)}>ویرایش</Button>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>
      <Modal isOpen={modalOpen} onOpenChange={setModalOpen}>
        <ModalShell size="lg">
          <ModalHeader>{form.id ? 'ویرایش دسته‌بندی' : 'افزودن دسته‌بندی'}</ModalHeader>
          <ModalBody className="grid grid-cols-1 gap-3">
            <Input label="نام فارسی" value={form.name_fa} onValueChange={(v) => setForm((f) => ({ ...f, name_fa: v }))} />
            <Input label="نام انگلیسی (اختیاری)" value={form.name} onValueChange={(v) => setForm((f) => ({ ...f, name: v }))} />
            <Input label="توضیحات (اختیاری)" value={form.description} onValueChange={(v) => setForm((f) => ({ ...f, description: v }))} />
          </ModalBody>
          <ModalFooter>
            <Button variant="light" onPress={() => setModalOpen(false)}>انصراف</Button>
            <Button color="primary" isLoading={saving} onPress={submit}>{form.id ? 'ذخیره تغییرات' : 'ثبت دسته‌بندی'}</Button>
          </ModalFooter>
        </ModalShell>
      </Modal>
    </div>
  );
}
