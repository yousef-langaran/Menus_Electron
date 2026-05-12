import { useEffect, useMemo, useRef, useState } from 'react';
import { Card, CardContent, Modal, ModalBody, ModalFooter, ModalHeader } from '@heroui/react';
import { Button } from '../ui/compat-button';
import { Input } from '../ui/compat-input';
import { ModalShell } from '../ui/modal-shell';
import { Select, SelectItem } from '../ui/compat-select';
import { useAuthStore } from '../store/authStore';
import { createProduct, getCategories, getProducts, updateProductById } from '../services/api';

type ProductForm = {
  id?: number;
  barcode: string;
  name_fa: string;
  name: string;
  price: string;
  category_id: string;
};

const emptyForm: ProductForm = {
  barcode: '',
  name_fa: '',
  name: '',
  price: '',
  category_id: '',
};

const normalizeBarcode = (value: string) =>
  String(value || '')
    .replace(/[\u200C\u200F\u202A-\u202E]/g, '')
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 1632))
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 1776))
    .replace(/\s+/g, '')
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

export default function ProductsPage() {
  const { user, token } = useAuthStore();
  const restaurantName = user?.restaurants?.[0]?.name;
  const restaurantId = user?.restaurants?.[0]?.id;
  const [products, setProducts] = useState<any[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState<ProductForm>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const scanBufferRef = useRef('');
  const scanLastKeyAtRef = useRef(0);

  const loadData = async () => {
    if (!token) return;
    setLoading(true);
    try {
      const [p, c] = await Promise.all([
        getProducts(restaurantName, restaurantId, token),
        getCategories(restaurantName, restaurantId, token),
      ]);
      setProducts(p);
      setCategories(c);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadData();
  }, [token, restaurantId]);

  const openCreate = (barcode: string) => {
    setForm({
      ...emptyForm,
      barcode,
      category_id: String(categories?.[0]?.id || ''),
    });
    setModalOpen(true);
  };

  const openEdit = (product: any) => {
    setForm({
      id: Number(product.id),
      barcode: String(product?.barcode || ''),
      name_fa: String(product?.name_fa || ''),
      name: String(product?.name || ''),
      price: String(product?.price ?? ''),
      category_id: String(product?.category?.id || product?.category_id || categories?.[0]?.id || ''),
    });
    setModalOpen(true);
  };

  const handleBarcodeActionWithCode = (rawCode: string) => {
    const code = normalizeBarcode(rawCode);
    if (!code) return;
    const found = products.find((p) => normalizeBarcode(String(p?.barcode || '')) === code);
    if (found) {
      setMessage('بارکد موجود بود؛ فرم ویرایش باز شد.');
      openEdit(found);
    } else {
      setMessage('بارکد جدید است؛ فرم افزودن باز شد.');
      openCreate(code);
    }
  };

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const now = Date.now();
      if (now - scanLastKeyAtRef.current > 250) {
        scanBufferRef.current = '';
      }
      scanLastKeyAtRef.current = now;

      const isEnter = e.key === 'Enter' || e.code === 'NumpadEnter' || (e as any).keyCode === 13;
      if (isEnter) {
        const code = normalizeBarcode(scanBufferRef.current);
        scanBufferRef.current = '';
        if (code.length >= 3) {
          e.preventDefault();
          e.stopPropagation();
          // If modal is open, scanner should fill current form barcode
          // instead of triggering global product lookup/create flow.
          if (modalOpen) {
            setForm((prev) => ({ ...prev, barcode: code }));
            setMessage(form.id ? 'بارکد در فرم ویرایش اعمال شد.' : 'بارکد در فرم افزودن اعمال شد.');
            return;
          }
          handleBarcodeActionWithCode(code);
        }
        return;
      }
      if (e.key.length === 1) {
        scanBufferRef.current += e.key;
      }
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [products, modalOpen, form.id]);

  const submit = async () => {
    if (!token) return;
    if (!form.name_fa.trim()) {
      setMessage('نام فارسی الزامی است');
      return;
    }
    if (!(Number(form.price) > 0)) {
      setMessage('قیمت باید بیشتر از صفر باشد');
      return;
    }
    if (!(Number(form.category_id) > 0)) {
      setMessage('دسته‌بندی را انتخاب کنید');
      return;
    }
    setSaving(true);
    try {
      if (form.id) {
        await updateProductById(
          form.id,
          {
            name_fa: form.name_fa.trim(),
            name: form.name.trim() || undefined,
            price: Number(form.price),
            category_id: Number(form.category_id),
            barcode: form.barcode.trim() || undefined,
          },
          token,
        );
        setMessage('محصول ویرایش شد');
      } else {
        await createProduct(
          {
            name_fa: form.name_fa.trim(),
            name: form.name.trim() || undefined,
            price: Number(form.price),
            category_id: Number(form.category_id),
            barcode: form.barcode.trim() || undefined,
            isAvailable: true,
            restaurantId: restaurantId ? Number(restaurantId) : undefined,
          },
          token,
        );
        setMessage('محصول جدید ثبت شد');
      }
      setModalOpen(false);
      await loadData();
    } catch (e: any) {
      setMessage(e?.response?.data?.message || e?.message || 'خطا در ذخیره محصول');
    } finally {
      setSaving(false);
    }
  };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return products;
    return products.filter((p) =>
      String(p?.name_fa || '').toLowerCase().includes(q) ||
      String(p?.name || '').toLowerCase().includes(q) ||
      String(p?.barcode || '').toLowerCase().includes(q),
    );
  }, [products, search]);

  return (
    <div className="min-h-screen bg-default-100">
      <header className="shrink-0 bg-content1 border-b border-default-200 px-4 py-3 shadow-sm">
        <h1 className="text-lg sm:text-xl font-bold">مدیریت محصولات</h1>
      </header>
      <div className="p-6 max-w-6xl mx-auto space-y-4">
        <Card>
          <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <Button variant="flat" color="secondary" onPress={() => openCreate('')}>افزودن محصول جدید</Button>
            <Input label="جستجو" placeholder="نام یا بارکد" value={search} onValueChange={setSearch} />
            <div className="text-xs text-default-500 flex items-center">
              اسکن بارکد از هر جای صفحه فعال است.
            </div>
          </CardContent>
        </Card>
        {message ? <p className="text-sm text-default-600">{message}</p> : null}
        <Card>
          <CardContent className="space-y-2">
            {loading ? (
              <p className="text-default-500">در حال بارگذاری...</p>
            ) : filtered.length === 0 ? (
              <p className="text-default-500">محصولی یافت نشد.</p>
            ) : (
              filtered.map((p) => (
                <div key={p.id} className="flex items-center justify-between rounded-lg border border-default-200 p-3">
                  <div>
                    <div className="font-semibold">{p.name_fa || p.name}</div>
                    <div className="text-xs text-default-500">بارکد: {p.barcode || '—'} | قیمت: {p.price}</div>
                  </div>
                  <Button size="sm" variant="flat" color="primary" onPress={() => openEdit(p)}>ویرایش</Button>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>

      <Modal isOpen={modalOpen} onOpenChange={setModalOpen}>
        <ModalShell size="lg">
          <ModalHeader>{form.id ? 'ویرایش محصول' : 'افزودن محصول'}</ModalHeader>
          <ModalBody className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <Input label="نام فارسی" value={form.name_fa} onValueChange={(v) => setForm((f) => ({ ...f, name_fa: v }))} />
            <Input label="نام انگلیسی" value={form.name} onValueChange={(v) => setForm((f) => ({ ...f, name: v }))} />
            <Input label="بارکد" value={form.barcode} onValueChange={(v) => setForm((f) => ({ ...f, barcode: v }))} />
            <Input
              label="قیمت"
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
                <SelectItem key={String(c.id)}>{c.name_fa || c.name}</SelectItem>
              ))}
            </Select>
          </ModalBody>
          <ModalFooter>
            <Button variant="light" onPress={() => setModalOpen(false)}>انصراف</Button>
            <Button color="primary" isLoading={saving} onPress={submit}>{form.id ? 'ذخیره تغییرات' : 'ثبت محصول'}</Button>
          </ModalFooter>
        </ModalShell>
      </Modal>
    </div>
  );
}
