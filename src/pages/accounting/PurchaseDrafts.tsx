import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button, Card, CardBody, Input, Modal, ModalBody, ModalContent, ModalFooter, ModalHeader, Select, SelectItem } from '@heroui/react';
import { useAuthStore } from '../../store/authStore';
import {
  accountingDb,
  createPurchaseInvoiceLocal,
  createRawMaterialLocal,
  deletePurchaseInvoiceDraftLocal,
  getPurchaseInvoiceItemsByInvoiceId,
  resetFailedPurchaseDraftsToPending,
  updatePurchaseInvoiceDraftLocal,
} from '../../services/accountingLocalDb';
import { getMasterProductByBarcode } from '../../services/api';

const RAW_MATERIAL_UNITS = ['gram', 'kilogram', 'liter', 'milliliter', 'piece', 'pack'];

export default function AccountingPurchaseDraftsPage() {
  const navigate = useNavigate();
  const { user, token } = useAuthStore((s) => ({ user: s.user, token: s.token }));
  const restaurantId = user?.restaurants?.[0]?.id;
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [materials, setMaterials] = useState<any[]>([]);
  const [drafts, setDrafts] = useState<any[]>([]);
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [invoiceNumber, setInvoiceNumber] = useState('');
  const [supplierId, setSupplierId] = useState('');
  const [extraCosts, setExtraCosts] = useState('0');
  const [items, setItems] = useState<Array<{ rawMaterialId: string; quantity: string; unitPrice: string }>>([]);
  const [barcode, setBarcode] = useState('');
  const [error, setError] = useState('');

  // ── افزودن ماده اولیه جدید هنگام عدم یافتن بارکد ──
  const [addMaterialOpen, setAddMaterialOpen] = useState(false);
  const [addMaterialBarcode, setAddMaterialBarcode] = useState('');
  const [addMaterialName, setAddMaterialName] = useState('');
  const [addMaterialUnit, setAddMaterialUnit] = useState('piece');
  const [addMaterialPrice, setAddMaterialPrice] = useState('');
  const [isCheckingMasterProduct, setIsCheckingMasterProduct] = useState(false);
  const [addMaterialSubmitting, setAddMaterialSubmitting] = useState(false);
  const [addMaterialError, setAddMaterialError] = useState('');

  const reload = async () => {
    if (!restaurantId) return;
    const [s, m, d] = await Promise.all([
      accountingDb.suppliers.where('restaurantId').equals(restaurantId).reverse().sortBy('id'),
      accountingDb.rawMaterials.where('restaurantId').equals(restaurantId).reverse().sortBy('id'),
      accountingDb.purchaseInvoices.where('restaurantId').equals(restaurantId).reverse().sortBy('id'),
    ]);
    setSuppliers(s);
    setMaterials(m);
    setDrafts(d);
  };
  useEffect(() => { void reload(); }, [restaurantId]);

  const materialOptions = useMemo(() => materials.map((x) => ({ id: String(x.id), label: x.name })), [materials]);

  const handleSubmitAddMaterial = async () => {
    if (!restaurantId || !addMaterialName.trim()) {
      setAddMaterialError('نام ماده اولیه الزامی است');
      return;
    }
    setAddMaterialSubmitting(true);
    setAddMaterialError('');
    try {
      const newMaterial = await createRawMaterialLocal({
        restaurantId,
        name: addMaterialName.trim(),
        unit: addMaterialUnit,
        barcode: addMaterialBarcode || undefined,
      });
      await reload();
      const price = addMaterialPrice.trim() || '0';
      setItems((prev) =>
        prev.length === 0
          ? [{ rawMaterialId: String(newMaterial.id), quantity: '1', unitPrice: price }]
          : prev.map((x, i) => i === prev.length - 1 ? { ...x, rawMaterialId: String(newMaterial.id), unitPrice: price } : x),
      );
      setBarcode('');
      setAddMaterialOpen(false);
    } catch {
      setAddMaterialError('خطا در ثبت ماده اولیه. لطفاً دوباره تلاش کنید.');
    } finally {
      setAddMaterialSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-default-100 p-6 space-y-4">
      <div className="flex justify-between items-center">
        <h1 className="text-xl font-bold">پیش‌نویس‌های خرید</h1>
        <div className="flex gap-2">
          <Button variant="flat" onPress={() => navigate('/accounting')}>بازگشت</Button>
          <Button color="warning" variant="flat" onPress={async () => { if (!restaurantId) return; await resetFailedPurchaseDraftsToPending(restaurantId); await reload(); }}>ارسال مجدد ناموفق‌ها</Button>
          <Button color="primary" onPress={() => { setOpen(true); setEditingId(null); }}>ثبت پیش‌نویس</Button>
        </div>
      </div>
      <Card><CardBody className="gap-2">
        {drafts.map((d) => (
          <div key={d.id} className="text-sm bg-default-100 rounded p-2 flex justify-between">
            <span>{d.invoiceNumber} | وضعیت: {d.status} | همگام‌سازی: {d.localSyncStatus}</span>
            <div className="flex gap-1">
              <Button size="sm" variant="flat" onPress={async () => {
                const lines = await getPurchaseInvoiceItemsByInvoiceId(d.id);
                setEditingId(d.id);
                setInvoiceNumber(d.invoiceNumber);
                setSupplierId(String(d.supplierId || ''));
                setExtraCosts(String(d.extraCosts || '0'));
                setItems(lines.map((x) => ({ rawMaterialId: String(x.rawMaterialId), quantity: String(x.quantity), unitPrice: String(x.unitPrice) })));
                setOpen(true);
              }}>ویرایش</Button>
              <Button size="sm" color="danger" variant="light" onPress={async () => { await deletePurchaseInvoiceDraftLocal(d.id); await reload(); }}>حذف</Button>
            </div>
          </div>
        ))}
      </CardBody></Card>

      <Modal isOpen={open} onOpenChange={setOpen} size="4xl">
        <ModalContent>
          <ModalHeader>{editingId ? 'ویرایش پیش‌نویس خرید' : 'ثبت پیش‌نویس خرید'}</ModalHeader>
          <ModalBody className="gap-3">
            <Input label="شماره فاکتور" value={invoiceNumber} onValueChange={setInvoiceNumber} />
            <Select label="تامین‌کننده" selectedKeys={supplierId ? [supplierId] : []} onSelectionChange={(k) => setSupplierId(String(Array.from(k)[0] || ''))}>
              {suppliers.map((s) => <SelectItem key={String(s.id)}>{s.name}</SelectItem>)}
            </Select>
            <Input type="number" label="هزینه جانبی" value={extraCosts} onValueChange={setExtraCosts} />
            <div className="grid grid-cols-1 md:grid-cols-[1fr_auto] gap-2">
              <Input label="بارکد" value={barcode} onValueChange={setBarcode} />
              <Button variant="flat" onPress={async () => {
                const code = barcode.trim();
                if (!code) return;
                const matched = materials.find((m) => String(m.barcode || '').trim() === code);
                if (matched) {
                  setItems((prev) => prev.length === 0 ? [{ rawMaterialId: String(matched.id), quantity: '1', unitPrice: '0' }] : prev.map((x, i) => i === prev.length - 1 ? { ...x, rawMaterialId: String(matched.id) } : x));
                  setBarcode('');
                  return;
                }
                setAddMaterialBarcode(code);
                setAddMaterialName('');
                setAddMaterialUnit('piece');
                setAddMaterialPrice('');
                setAddMaterialError('');
                setIsCheckingMasterProduct(true);
                setAddMaterialOpen(true);
                try {
                  const master = await getMasterProductByBarcode(code, token || undefined);
                  if (master) {
                    setAddMaterialName(master.name);
                  }
                } finally {
                  setIsCheckingMasterProduct(false);
                }
              }}>اعمال بارکد</Button>
            </div>
            {items.map((line, idx) => (
              <div key={idx} className="grid grid-cols-1 md:grid-cols-4 gap-2 bg-default-100 p-2 rounded">
                <Select label="ماده اولیه" selectedKeys={line.rawMaterialId ? [line.rawMaterialId] : []} onSelectionChange={(k) => setItems((prev) => prev.map((x, i) => i === idx ? { ...x, rawMaterialId: String(Array.from(k)[0] || '') } : x))}>
                  {materialOptions.map((m) => <SelectItem key={m.id}>{m.label}</SelectItem>)}
                </Select>
                <Input type="number" label="مقدار" value={line.quantity} onValueChange={(v) => setItems((prev) => prev.map((x, i) => i === idx ? { ...x, quantity: v } : x))} />
                <Input type="number" label="قیمت واحد" value={line.unitPrice} onValueChange={(v) => setItems((prev) => prev.map((x, i) => i === idx ? { ...x, unitPrice: v } : x))} />
                <Button color="danger" variant="light" onPress={() => setItems((prev) => prev.filter((_, i) => i !== idx))}>حذف</Button>
              </div>
            ))}
            <Button variant="secondary" onPress={() => setItems((prev) => [...prev, { rawMaterialId: '', quantity: '1', unitPrice: '0' }])}>افزودن آیتم</Button>
            {error ? <p className="text-danger text-sm">{error}</p> : null}
          </ModalBody>
          <ModalFooter>
            <Button variant="flat" onPress={() => setOpen(false)}>انصراف</Button>
            <Button color="primary" onPress={async () => {
              if (!restaurantId || !supplierId || !invoiceNumber.trim()) return;
              const lines = items.map((x) => ({ rawMaterialId: Number(x.rawMaterialId), quantity: Number(x.quantity || 0), unitPrice: Number(x.unitPrice || 0) })).filter((x) => x.rawMaterialId > 0 && x.quantity > 0);
              if (!lines.length) { setError('حداقل یک آیتم معتبر وارد کنید.'); return; }
              if (editingId) {
                await updatePurchaseInvoiceDraftLocal({ invoiceId: editingId, restaurantId, supplierId: Number(supplierId), invoiceNumber: invoiceNumber.trim(), purchaseDate: new Date().toISOString().slice(0, 10), items: lines, extraCosts: Number(extraCosts || 0) });
              } else {
                await createPurchaseInvoiceLocal({ restaurantId, supplierId: Number(supplierId), invoiceNumber: invoiceNumber.trim(), purchaseDate: new Date().toISOString().slice(0, 10), items: lines, extraCosts: Number(extraCosts || 0) });
              }
              setOpen(false); setItems([]); setInvoiceNumber(''); setSupplierId(''); setExtraCosts('0'); setEditingId(null); setError('');
              await reload();
            }}>ذخیره</Button>
          </ModalFooter>
        </ModalContent>
      </Modal>

      {/* مودال افزودن ماده اولیه جدید هنگام عدم یافتن بارکد */}
      <Modal isOpen={addMaterialOpen} onOpenChange={setAddMaterialOpen} size="lg">
        <ModalContent>
          <ModalHeader>افزودن ماده اولیه جدید</ModalHeader>
          <ModalBody className="gap-3">
            {isCheckingMasterProduct && (
              <p className="text-default-500 text-sm text-center py-2">در حال جستجو در محصولات پایه...</p>
            )}
            <Input label="بارکد" value={addMaterialBarcode} isReadOnly />
            <Input
              label="نام ماده اولیه"
              value={addMaterialName}
              onValueChange={setAddMaterialName}
              isDisabled={isCheckingMasterProduct}
            />
            <Select
              label="واحد"
              selectedKeys={[addMaterialUnit]}
              onSelectionChange={(k) => setAddMaterialUnit(String(Array.from(k)[0] || 'piece'))}
              isDisabled={isCheckingMasterProduct}
            >
              {RAW_MATERIAL_UNITS.map((u) => <SelectItem key={u}>{u}</SelectItem>)}
            </Select>
            <Input
              type="number"
              label="قیمت واحد (برای این فاکتور)"
              value={addMaterialPrice}
              onValueChange={setAddMaterialPrice}
              isDisabled={isCheckingMasterProduct}
            />
            {addMaterialError && <p className="text-danger text-sm">{addMaterialError}</p>}
          </ModalBody>
          <ModalFooter>
            <Button variant="flat" onPress={() => setAddMaterialOpen(false)}>انصراف</Button>
            <Button
              color="primary"
              isLoading={addMaterialSubmitting}
              isDisabled={isCheckingMasterProduct}
              onPress={handleSubmitAddMaterial}
            >
              ثبت ماده اولیه
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </div>
  );
}
