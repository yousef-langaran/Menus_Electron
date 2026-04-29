import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button, Card, CardBody, Input, Modal, ModalBody, ModalContent, ModalFooter, ModalHeader, Select, SelectItem } from '@heroui/react';
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

export default function ProductsPage() {
  const navigate = useNavigate();
  const { user, token, logout } = useAuthStore();
  const restaurantName = user?.restaurants?.[0]?.name;
  const restaurantId = user?.restaurants?.[0]?.id;
  const [products, setProducts] = useState<any[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [barcodeInput, setBarcodeInput] = useState('');
  const [search, setSearch] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState<ProductForm>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

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

  const handleBarcodeAction = () => {
    const code = barcodeInput.trim();
    if (!code) return;
    const found = products.find((p) => String(p?.barcode || '').trim() === code);
    if (found) {
      setMessage('بارکد موجود بود؛ فرم ویرایش باز شد.');
      openEdit(found);
    } else {
      setMessage('بارکد جدید است؛ فرم افزودن باز شد.');
      openCreate(code);
    }
  };

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
      setBarcodeInput('');
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
      <header className="bg-content1 border-b border-default-200 px-6 py-4 flex justify-between items-center shadow-sm">
        <h1 className="text-xl font-bold">مدیریت محصولات</h1>
        <div className="flex gap-2">
          <Button variant="flat" color="secondary" onPress={() => navigate('/categories')}>مدیریت دسته‌بندی‌ها</Button>
          <Button variant="flat" onPress={() => navigate('/order')}>ثبت سفارش</Button>
          <Button variant="flat" onPress={() => navigate('/orders')}>سفارشات</Button>
          <Button color="danger" variant="flat" onPress={logout}>خروج</Button>
        </div>
      </header>
      <div className="p-6 max-w-6xl mx-auto space-y-4">
        <Card>
          <CardBody className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <Input
              label="بارکد"
              placeholder="بارکد را اسکن/وارد کنید"
              value={barcodeInput}
              onValueChange={setBarcodeInput}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  handleBarcodeAction();
                }
              }}
            />
            <Button color="primary" onPress={handleBarcodeAction}>بررسی بارکد</Button>
            <Button variant="flat" color="secondary" onPress={() => openCreate('')}>افزودن محصول جدید</Button>
            <Input label="جستجو" placeholder="نام یا بارکد" value={search} onValueChange={setSearch} />
          </CardBody>
        </Card>
        {message ? <p className="text-sm text-default-600">{message}</p> : null}
        <Card>
          <CardBody className="space-y-2">
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
          </CardBody>
        </Card>
      </div>

      <Modal isOpen={modalOpen} onOpenChange={setModalOpen} size="2xl">
        <ModalContent>
          <ModalHeader>{form.id ? 'ویرایش محصول' : 'افزودن محصول'}</ModalHeader>
          <ModalBody className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <Input label="نام فارسی" value={form.name_fa} onValueChange={(v) => setForm((f) => ({ ...f, name_fa: v }))} />
            <Input label="نام انگلیسی" value={form.name} onValueChange={(v) => setForm((f) => ({ ...f, name: v }))} />
            <Input label="بارکد" value={form.barcode} onValueChange={(v) => setForm((f) => ({ ...f, barcode: v }))} />
            <Input label="قیمت" type="number" value={form.price} onValueChange={(v) => setForm((f) => ({ ...f, price: v }))} />
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
        </ModalContent>
      </Modal>
    </div>
  );
}
