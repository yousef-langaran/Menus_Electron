import { useEffect, useRef, useState } from 'react';
import { Card, CardContent, Modal, ModalBody, ModalFooter, ModalHeader } from '@heroui/react';
import { Button } from '../ui/compat-button';
import { Input } from '../ui/compat-input';
import { ModalShell } from '../ui/modal-shell';
import { Select, SelectItem } from '../ui/compat-select';
import { useAuthStore } from '../store/authStore';
import { NameAutocomplete } from '../ui/NameAutocomplete';
import { getMasterProductByBarcode, searchMasterProducts } from '../services/api';
import {
  createProductLocal,
  getLocalCategories,
  getLocalProducts,
  updateProductLocal,
  type LocalCategory,
  type LocalProduct,
} from '../services/catalogLocalDb';
import { runCatalogSync } from '../services/catalogSync';
import { toast } from '../utils/toast';

const PAGE_SIZE = 20;

const PRODUCT_UNITS = [
  'عدد', 'کیلوگرم', 'گرم', 'لیتر', 'میلی‌لیتر',
  'متر', 'سانتی‌متر', 'بسته', 'جعبه', 'پرس', 'وعده', 'پیمانه', 'قوطی', 'بطری',
];

type ProductForm = {
  id?: number;
  barcode: string;
  name_fa: string;
  name: string;
  price: string;
  category_id: string;
  unit: string;
};

const emptyForm: ProductForm = {
  barcode: '',
  name_fa: '',
  name: '',
  price: '',
  category_id: '',
  unit: 'عدد',
};

const normalizeBarcode = (value: string) =>
  String(value || '')
    .replace(/[‌‏‪-‮]/g, '')
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 1632))
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 1776))
    .replace(/\s+/g, '')
    .replace(/^\/+|\/+$/g, '')
    .trim();

const normalizeDigits = (value: string) =>
  String(value || '')
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 1632))
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 1776));

const normalizePriceInput = (value: string) =>
  normalizeDigits(value).replace(/[^\d]/g, '');

const formatPriceInput = (value: string) => {
  const digits = normalizePriceInput(value);
  if (!digits) return '';
  return new Intl.NumberFormat('en-US').format(Number(digits));
};

function SyncBadge({ status, error }: { status: LocalProduct['_syncStatus']; error?: string | null }) {
  if (status === 'synced') return null;
  if (status === 'pending_create' || status === 'pending_update') {
    return (
      <span className="text-xs bg-warning-100 text-warning-700 border border-warning-300 px-2 py-0.5 rounded-full">
        در انتظار سینک
      </span>
    );
  }
  return (
    <span className="text-xs bg-danger-100 text-danger-700 border border-danger-300 px-2 py-0.5 rounded-full" title={error ?? ''}>
      خطای سینک
    </span>
  );
}

export default function ProductsPage() {
  const { user, token } = useAuthStore();
  const restaurantName = user?.restaurants?.[0]?.name;
  const restaurantId = user?.restaurants?.[0]?.id;

  const [allProducts, setAllProducts] = useState<LocalProduct[]>([]);
  const [categories, setCategories] = useState<LocalCategory[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [selectedCategoryId, setSelectedCategoryId] = useState<number | null>(null);
  const [page, setPage] = useState(1);
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState<ProductForm>(emptyForm);
  const [saving, setSaving] = useState(false);
  const scanBufferRef = useRef('');
  const scanLastKeyAtRef = useRef(0);
  const [nameSuggestions, setNameSuggestions] = useState<import('../services/api').MasterProduct[]>([]);
  const nameSuggestTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [isOnline, setIsOnline] = useState(typeof navigator !== 'undefined' ? navigator.onLine : true);

  // فیلتر و صفحه‌بندی در حافظه
  const filteredProducts = (() => {
    const q = search.trim().toLowerCase();
    return allProducts.filter((p) => {
      const catMatch = selectedCategoryId === null || p.category_id === selectedCategoryId;
      const searchMatch = !q || p.name_fa.toLowerCase().includes(q) || (p.name || '').toLowerCase().includes(q) || (p.barcode || '').includes(q);
      return catMatch && searchMatch;
    });
  })();
  const total = filteredProducts.length;
  const totalPages = Math.ceil(total / PAGE_SIZE);
  const products = filteredProducts.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const loadFromDb = async () => {
    if (!restaurantId) return;
    setLoading(true);
    try {
      const [{ data }, cats] = await Promise.all([
        getLocalProducts(restaurantId),
        getLocalCategories(restaurantId),
      ]);
      setAllProducts(data);
      setCategories(cats);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadFromDb();
    const onSync = () => void loadFromDb();
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

  const handleSearchChange = (value: string) => {
    setSearch(value);
    setPage(1);
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
  };

  const handleCategoryFilter = (catId: number | null) => {
    setSelectedCategoryId(catId);
    setPage(1);
  };

  const openCreate = (barcode: string) => {
    setForm({
      ...emptyForm,
      barcode,
      category_id: String(categories.find((c) => c._syncStatus === 'synced')?.id || categories[0]?.id || ''),
      unit: 'عدد',
    });
    setModalOpen(true);
  };

  const openEdit = (product: LocalProduct) => {
    setForm({
      id: product.id,
      barcode: product.barcode || '',
      name_fa: product.name_fa,
      name: product.name || '',
      price: String(product.price),
      category_id: String(product.category_id || categories[0]?.id || ''),
      unit: product.unit || 'عدد',
    });
    setModalOpen(true);
  };

  const handleBarcodeActionWithCode = async (rawCode: string) => {
    const code = normalizeBarcode(rawCode);
    if (!code) return;

    const found = allProducts.find((p) => normalizeBarcode(p.barcode || '') === code);
    if (found) {
      toast.info('بارکد موجود بود؛ فرم ویرایش باز شد.');
      openEdit(found);
      return;
    }

    const master = await getMasterProductByBarcode(code, token ?? undefined);
    setForm({
      ...emptyForm,
      barcode: code,
      name_fa: master?.name || '',
      name: master?.name || '',
      category_id: String(categories[0]?.id || ''),
    });
    setModalOpen(true);
    toast.info(
      master
        ? `محصول «${master.name}» از پایگاه اصلی یافت شد؛ فرم افزودن باز شد.`
        : 'بارکد جدید است؛ فرم افزودن باز شد.',
    );
  };

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const isEnter = e.key === 'Enter' || e.code === 'NumpadEnter' || (e as any).keyCode === 13;
      const now = Date.now();

      if (isEnter) {
        const code = normalizeBarcode(scanBufferRef.current);
        scanBufferRef.current = '';
        scanLastKeyAtRef.current = 0;
        if (code.length >= 3) {
          e.preventDefault();
          e.stopPropagation();
          if (modalOpen) {
            setForm((prev) => ({ ...prev, barcode: code }));
            toast.info(form.id ? 'بارکد در فرم ویرایش اعمال شد.' : 'بارکد در فرم افزودن اعمال شد.');
            return;
          }
          void handleBarcodeActionWithCode(code);
        }
        return;
      }

      if (now - scanLastKeyAtRef.current > 250) {
        scanBufferRef.current = '';
      }
      scanLastKeyAtRef.current = now;
      if (e.key.length === 1) {
        scanBufferRef.current += e.key;
        const buf = scanBufferRef.current;
        if (buf.length >= 3 && buf[0] === '/' && buf[buf.length - 1] === '/') {
          const code = normalizeBarcode(buf.slice(1, -1));
          if (code.length >= 3) {
            scanBufferRef.current = '';
            scanLastKeyAtRef.current = 0;
            e.preventDefault();
            e.stopPropagation();
            if (modalOpen) {
              setForm((prev) => ({ ...prev, barcode: code }));
              toast.info(form.id ? 'بارکد در فرم ویرایش اعمال شد.' : 'بارکد در فرم افزودن اعمال شد.');
            } else {
              void handleBarcodeActionWithCode(code);
            }
          }
        }
      }
    };
    document.addEventListener('keydown', onKeyDown, true);
    return () => document.removeEventListener('keydown', onKeyDown, true);
  }, [categories, modalOpen, form.id]);

  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const text = e.clipboardData?.getData('text/plain') || '';
      const code = normalizeBarcode(text);
      if (code.length < 3) return;
      e.preventDefault();
      e.stopPropagation();
      if (modalOpen) {
        setForm((prev) => ({ ...prev, barcode: code }));
        toast.info(form.id ? 'بارکد در فرم ویرایش اعمال شد.' : 'بارکد در فرم افزودن اعمال شد.');
      } else {
        void handleBarcodeActionWithCode(code);
      }
    };
    document.addEventListener('paste', onPaste, true);
    return () => document.removeEventListener('paste', onPaste, true);
  }, [categories, modalOpen, form.id]);

  const submit = async () => {
    if (!token || !restaurantId) return;
    if (!form.name_fa.trim()) {
      toast.error('نام فارسی الزامی است');
      return;
    }
    if (!(Number(form.price) > 0)) {
      toast.error('قیمت باید بیشتر از صفر باشد');
      return;
    }
    if (!(Number(form.category_id) !== 0)) {
      toast.error('دسته‌بندی را انتخاب کنید');
      return;
    }
    setSaving(true);
    try {
      if (form.id !== undefined) {
        await updateProductLocal(form.id, {
          name_fa: form.name_fa.trim(),
          name: form.name.trim() || '',
          price: Number(form.price),
          category_id: Number(form.category_id),
          barcode: form.barcode.trim() || null,
          unit: form.unit || 'عدد',
        });
        isOnline ? toast.success('محصول ویرایش شد') : toast.info('محصول ذخیره شد — در انتظار سینک');
      } else {
        await createProductLocal({
          restaurantId,
          name_fa: form.name_fa.trim(),
          name: form.name.trim() || undefined,
          price: Number(form.price),
          category_id: Number(form.category_id),
          barcode: form.barcode.trim() || undefined,
          unit: form.unit || 'عدد',
          isAvailable: true,
        });
        isOnline ? toast.success('محصول جدید ثبت شد') : toast.info('محصول ذخیره شد — در انتظار سینک');
      }
      setModalOpen(false);
      await loadFromDb();

      // سینک فوری اگر آنلاین هستیم
      if (isOnline) {
        try {
          await runCatalogSync({ restaurantId, restaurantName, token });
          await loadFromDb();
        } catch {
          // سینک background انجام خواهد داد
        }
      }
    } catch (e: any) {
      toast.error(e?.message || 'خطا در ذخیره محصول');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-default-100">
      <header className="shrink-0 bg-content1 border-b border-default-200 px-4 py-3 shadow-sm flex items-center justify-between">
        <h1 className="text-lg sm:text-xl font-bold">مدیریت محصولات</h1>
        {!isOnline && (
          <span className="text-xs bg-warning-100 text-warning-700 border border-warning-300 px-2 py-1 rounded-full">
            آفلاین — تغییرات ذخیره می‌شوند
          </span>
        )}
      </header>
      <div className="p-6 max-w-6xl mx-auto space-y-4">
        <Card>
          <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <Button variant="flat" color="secondary" onPress={() => openCreate('')}>افزودن محصول جدید</Button>
            <Input
              label="جستجو"
              placeholder="نام یا بارکد"
              value={search}
              onValueChange={handleSearchChange}
            />
            <div className="text-xs text-default-500 flex items-center">
              اسکن بارکد از هر جای صفحه فعال است.
            </div>
          </CardContent>
        </Card>
        {categories.length > 0 && (
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              variant={selectedCategoryId === null ? 'solid' : 'bordered'}
              color="primary"
              onPress={() => handleCategoryFilter(null)}
            >
              همه
            </Button>
            {categories.map((c) => (
              <Button
                key={c.id}
                size="sm"
                variant={selectedCategoryId === c.id ? 'solid' : 'bordered'}
                color="primary"
                onPress={() => handleCategoryFilter(c.id)}
              >
                {c.name_fa || c.name}
              </Button>
            ))}
          </div>
        )}
        <Card>
          <CardContent className="space-y-2">
            {loading ? (
              <p className="text-default-500">در حال بارگذاری...</p>
            ) : products.length === 0 ? (
              <p className="text-default-500">محصولی یافت نشد.</p>
            ) : (
              products.map((p) => (
                <div key={p.id} className="flex items-center justify-between rounded-lg border border-default-200 p-3">
                  <div className="space-y-1">
                    <div className="font-semibold flex items-center gap-2">
                      {p.name_fa || p.name}
                      <SyncBadge status={p._syncStatus} error={p._syncError} />
                    </div>
                    <div className="text-xs text-default-500">
                      بارکد: {p.barcode || '—'} | قیمت: {p.price.toLocaleString('fa-IR')}
                      {(() => { const cat = categories.find((c) => c.id === p.category_id); return cat ? ` | ${cat.name_fa || cat.name}` : ''; })()}
                    </div>
                  </div>
                  <Button size="sm" variant="flat" color="primary" onPress={() => openEdit(p)}>ویرایش</Button>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        {totalPages > 1 && (
          <div className="flex items-center justify-center gap-3">
            <Button
              size="sm"
              variant="flat"
              isDisabled={page <= 1 || loading}
              onPress={() => setPage((p) => p - 1)}
            >
              قبلی
            </Button>
            <span className="text-sm text-default-600">
              صفحه {page} از {totalPages} ({total} محصول)
            </span>
            <Button
              size="sm"
              variant="flat"
              isDisabled={page >= totalPages || loading}
              onPress={() => setPage((p) => p + 1)}
            >
              بعدی
            </Button>
          </div>
        )}
        {totalPages <= 1 && total > 0 && !loading && (
          <p className="text-center text-xs text-default-400">{total} محصول</p>
        )}
      </div>

      <Modal isOpen={modalOpen} onOpenChange={setModalOpen}>
        <ModalShell size="lg">
          <ModalHeader>{form.id !== undefined ? 'ویرایش محصول' : 'افزودن محصول'}</ModalHeader>
          <ModalBody className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <NameAutocomplete
              value={form.name_fa}
              onValueChange={(v) => {
                setForm((f) => ({ ...f, name_fa: v }));
                if (nameSuggestTimerRef.current) clearTimeout(nameSuggestTimerRef.current);
                if (!v.trim()) { setNameSuggestions([]); return; }
                nameSuggestTimerRef.current = setTimeout(async () => {
                  const results = await searchMasterProducts(v, token ?? undefined);
                  setNameSuggestions(results);
                }, 300);
              }}
              suggestions={nameSuggestions}
              onSelect={(s) => {
                setForm((f) => ({
                  ...f,
                  name_fa: s.name,
                  name: f.name || s.name,
                  barcode: f.barcode || s.barcode || '',
                }));
                setNameSuggestions([]);
              }}
            />
            <Input label="نام انگلیسی" value={form.name} onValueChange={(v) => setForm((f) => ({ ...f, name: v }))} />
            <Input label="بارکد" value={form.barcode} onValueChange={(v) => setForm((f) => ({ ...f, barcode: v }))} />
            <Input
              label="قیمت (تومان)"
              type="text"
              inputMode="numeric"
              value={formatPriceInput(form.price)}
              onValueChange={(v) => setForm((f) => ({ ...f, price: normalizePriceInput(v) }))}
            />
            <Select
              label="دسته‌بندی"
              selectedKeys={form.category_id ? [form.category_id] : []}
              onSelectionChange={(keys) => setForm((f) => ({ ...f, category_id: String(Array.from(keys)[0] || '') }))}
            >
              {categories.map((c) => (
                <SelectItem key={String(c.id)}>
                  {c.name_fa || c.name}{c._syncStatus !== 'synced' ? ' ⏳' : ''}
                </SelectItem>
              ))}
            </Select>
            <Select
              label="واحد شمارش"
              selectedKeys={[form.unit || 'عدد']}
              onSelectionChange={(keys) => setForm((f) => ({ ...f, unit: String(Array.from(keys)[0] || 'عدد') }))}
            >
              {PRODUCT_UNITS.map((u) => (
                <SelectItem key={u}>{u}</SelectItem>
              ))}
            </Select>
          </ModalBody>
          <ModalFooter>
            <Button variant="light" onPress={() => setModalOpen(false)}>انصراف</Button>
            <Button color="primary" isLoading={saving} onPress={submit}>
              {form.id !== undefined ? 'ذخیره تغییرات' : 'ثبت محصول'}
            </Button>
          </ModalFooter>
        </ModalShell>
      </Modal>
    </div>
  );
}
