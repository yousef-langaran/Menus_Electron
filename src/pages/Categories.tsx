import { useEffect, useMemo, useState } from 'react';
import { Card, CardContent, Modal, ModalBody, ModalFooter, ModalHeader } from '@heroui/react';
import { Button } from '../ui/compat-button';
import { Input } from '../ui/compat-input';
import { SwitchCompat } from '../ui/compat-switch';
import { ModalShell } from '../ui/modal-shell';
import { useAuthStore } from '../store/authStore';
import {
  createCategoryLocal,
  deleteCategoryLocal,
  getLocalCategories,
  updateCategoryLocal,
  type LocalCategory,
} from '../services/catalogLocalDb';
import { runCatalogSync } from '../services/catalogSync';
import { toast } from '../utils/toast';

type CategoryForm = {
  id?: number;
  name_fa: string;
  name: string;
  description: string;
  hasVat: boolean;
};

const emptyForm: CategoryForm = {
  name_fa: '',
  name: '',
  description: '',
  hasVat: false,
};

function SyncBadge({ status }: { status: LocalCategory['_syncStatus'] }) {
  if (status === 'synced') return null;
  if (status === 'pending_create' || status === 'pending_update') {
    return (
      <span className="text-xs bg-warning-soft text-warning-soft-foreground border border-warning/40 px-2 py-0.5 rounded-full">
        در انتظار سینک
      </span>
    );
  }
  return (
    <span className="text-xs bg-danger-soft text-danger-soft-foreground border border-danger/40 px-2 py-0.5 rounded-full">
      خطای سینک
    </span>
  );
}

export default function CategoriesPage() {
  const { user, token } = useAuthStore();
  const restaurantName = user?.restaurants?.[0]?.name;
  const restaurantId = user?.restaurants?.[0]?.id;

  const [rows, setRows] = useState<LocalCategory[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState<CategoryForm>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [isOnline, setIsOnline] = useState(typeof navigator !== 'undefined' ? navigator.onLine : true);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  // هنگام رفرش داده‌های قبلی روی صفحه می‌مانند تا صفحه پرش نکند؛
  // spinner فقط بار اول (وقتی هنوز داده‌ای نیست) نمایش داده می‌شود.
  const loadFromDb = async (isRefresh = false) => {
    if (!restaurantId) return;
    if (!isRefresh) setLoading(true);
    try {
      const data = await getLocalCategories(restaurantId);
      setRows(data);
    } finally {
      if (!isRefresh) setLoading(false);
    }
  };

  useEffect(() => {
    void loadFromDb();
    const onSync = () => void loadFromDb(true);
    const onOnline = () => setIsOnline(true);
    const onOffline = () => setIsOnline(false);
    window.addEventListener('catalog:synced', onSync);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    return () => {
      window.removeEventListener('catalog:synced', onSync);
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, [restaurantId]);

  const openCreate = () => {
    setForm(emptyForm);
    setModalOpen(true);
  };

  const openEdit = (row: LocalCategory) => {
    setForm({
      id: row.id,
      name_fa: row.name_fa,
      name: row.name || '',
      description: row.description || '',
      hasVat: Boolean(row.hasVat),
    });
    setModalOpen(true);
  };

  const submit = async () => {
    if (!token || !restaurantId) return;
    const trimmedNameFa = form.name_fa.trim();
    if (!trimmedNameFa) {
      toast.error('نام فارسی دسته‌بندی الزامی است');
      return;
    }

    // چک تکراری بودن نام در دیتابیس محلی
    const allLocal = await getLocalCategories(restaurantId);
    const isDuplicate = allLocal.some(
      (c) => c.name_fa.trim() === trimmedNameFa && c.id !== form.id,
    );
    if (isDuplicate) {
      toast.error('این نام فارسی قبلاً استفاده شده است');
      return;
    }

    setSaving(true);
    try {
      if (form.id !== undefined) {
        await updateCategoryLocal(form.id, {
          name_fa: trimmedNameFa,
          name: form.name.trim() || '',
          description: form.description.trim() || '',
          hasVat: form.hasVat,
        });
        isOnline ? toast.success('دسته‌بندی ویرایش شد') : toast.info('دسته‌بندی ذخیره شد — در انتظار سینک');
      } else {
        await createCategoryLocal({
          restaurantId,
          name_fa: trimmedNameFa,
          name: form.name.trim() || undefined,
          description: form.description.trim() || undefined,
          hasVat: form.hasVat,
        });
        isOnline ? toast.success('دسته‌بندی جدید ثبت شد') : toast.info('دسته‌بندی ذخیره شد — در انتظار سینک');
      }
      setModalOpen(false);
      await loadFromDb(true);

      if (isOnline) {
        try {
          await runCatalogSync({ restaurantId, restaurantName, token });
          await loadFromDb(true);
        } catch {
          // سینک background انجام خواهد داد
        }
      }
    } catch (e: any) {
      toast.error(e?.message || 'خطا در ذخیره دسته‌بندی');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (row: LocalCategory) => {
    if (deletingId === row.id) return;
    setDeletingId(row.id);
    try {
      await deleteCategoryLocal(row.id);
      await loadFromDb(true);
    } finally {
      setDeletingId(null);
    }
  };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((c) =>
      c.name_fa.toLowerCase().includes(q) ||
      (c.name || '').toLowerCase().includes(q),
    );
  }, [rows, search]);

  return (
    <div className="min-h-screen bg-background">
      <header className="shrink-0 bg-surface border-b border-border px-4 py-3 shadow-sm flex items-center justify-between">
        <h1 className="text-lg sm:text-xl font-bold">مدیریت دسته‌بندی‌ها</h1>
        {!isOnline && (
          <span className="text-xs bg-warning-soft text-warning-soft-foreground border border-warning/40 px-2 py-1 rounded-full">
            آفلاین — تغییرات ذخیره می‌شوند
          </span>
        )}
      </header>
      <div className="p-6 max-w-5xl mx-auto space-y-4">
        <Card>
          <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <Input label="جستجو" placeholder="نام دسته‌بندی" value={search} onValueChange={setSearch} />
            <Button color="primary" onPress={openCreate}>افزودن دسته‌بندی جدید</Button>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="space-y-2">
            {loading ? (
              <p className="text-muted">در حال بارگذاری...</p>
            ) : filtered.length === 0 ? (
              <p className="text-muted">دسته‌بندی‌ای یافت نشد.</p>
            ) : (
              filtered.map((c) => (
                <div key={c.id} className="rounded-lg border border-border p-3 space-y-1">
                  <div className="flex items-center justify-between">
                    <div className="space-y-1">
                      <div className="font-semibold flex items-center gap-2">
                        {c.name_fa || c.name}
                        {c.hasVat && (
                          <span className="text-xs bg-warning-soft text-warning-soft-foreground border border-warning/40 px-2 py-0.5 rounded-full">
                            ارزش افزوده
                          </span>
                        )}
                        <SyncBadge status={c._syncStatus} />
                      </div>
                      <div className="text-xs text-muted">{c.description || '—'}</div>
                    </div>
                    <div className="flex items-center gap-2">
                      {c._syncStatus === 'failed' && (
                        <Button
                          size="sm"
                          variant="flat"
                          color="danger"
                          isLoading={deletingId === c.id}
                          onPress={() => handleDelete(c)}
                        >
                          حذف
                        </Button>
                      )}
                      <Button size="sm" variant="flat" color="primary" onPress={() => openEdit(c)}>
                        ویرایش
                      </Button>
                    </div>
                  </div>
                  {c._syncStatus === 'failed' && c._syncError && (
                    <p className="text-xs text-danger bg-danger-soft border border-danger/30 rounded px-2 py-1">
                      {c._syncError}
                    </p>
                  )}
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>
      <Modal isOpen={modalOpen} onOpenChange={setModalOpen}>
        <ModalShell size="lg">
          <ModalHeader>{form.id !== undefined ? 'ویرایش دسته‌بندی' : 'افزودن دسته‌بندی'}</ModalHeader>
          <ModalBody className="grid grid-cols-1 gap-3">
            <Input label="نام فارسی" value={form.name_fa} onValueChange={(v) => setForm((f) => ({ ...f, name_fa: v }))} />
            <Input label="نام انگلیسی (اختیاری)" value={form.name} onValueChange={(v) => setForm((f) => ({ ...f, name: v }))} />
            <Input label="توضیحات (اختیاری)" value={form.description} onValueChange={(v) => setForm((f) => ({ ...f, description: v }))} />
            <div className="rounded-lg border border-border p-3 space-y-1">
              <SwitchCompat
                isSelected={form.hasVat}
                onValueChange={(v) => setForm((f) => ({ ...f, hasVat: v }))}
              >
                مشمول مالیات بر ارزش افزوده
              </SwitchCompat>
              <p className="text-xs text-muted">
                قیمت نمایشی محصولات این دسته تغییر نمی‌کند؛ مبلغ ارزش افزوده فقط هنگام تسویه
                زیر ردیف تخفیف در فیش نوشته و به مبلغ قابل پرداخت اضافه می‌شود.
              </p>
            </div>
          </ModalBody>
          <ModalFooter>
            <Button variant="light" onPress={() => setModalOpen(false)}>انصراف</Button>
            <Button color="primary" isLoading={saving} onPress={submit}>
              {form.id !== undefined ? 'ذخیره تغییرات' : 'ثبت دسته‌بندی'}
            </Button>
          </ModalFooter>
        </ModalShell>
      </Modal>
    </div>
  );
}
