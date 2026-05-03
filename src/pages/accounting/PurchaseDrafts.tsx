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
  createPurchaseInvoiceLocal,
  deletePurchaseInvoiceDraftLocal,
  getPurchaseInvoiceItemsByInvoiceId,
  resetFailedPurchaseDraftsToPending,
  updatePurchaseInvoiceDraftLocal,
} from '../../services/accountingLocalDb';

export default function AccountingPurchaseDraftsPage() {
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
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
      <Card><CardContent className="gap-2">
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
      </CardContent></Card>

      <Modal isOpen={open} onOpenChange={setOpen}>
        <ModalShell size="full">
          <ModalHeader>{editingId ? 'ویرایش پیش‌نویس خرید' : 'ثبت پیش‌نویس خرید'}</ModalHeader>
          <ModalBody className="gap-3">
            <Input label="شماره فاکتور" value={invoiceNumber} onValueChange={setInvoiceNumber} />
            <Select label="تامین‌کننده" selectedKeys={supplierId ? [supplierId] : []} onSelectionChange={(k) => setSupplierId(String(Array.from(k)[0] || ''))}>
              {suppliers.map((s) => <SelectItem key={String(s.id)}>{s.name}</SelectItem>)}
            </Select>
            <Input type="number" label="هزینه جانبی" value={extraCosts} onValueChange={setExtraCosts} />
            <div className="grid grid-cols-1 md:grid-cols-[1fr_auto] gap-2">
              <Input label="بارکد" value={barcode} onValueChange={setBarcode} />
              <Button variant="flat" onPress={() => {
                const matched = materials.find((m) => String(m.barcode || '').trim() === barcode.trim());
                if (!matched) return;
                setItems((prev) => prev.length === 0 ? [{ rawMaterialId: String(matched.id), quantity: '1', unitPrice: '0' }] : prev.map((x, i) => i === prev.length - 1 ? { ...x, rawMaterialId: String(matched.id) } : x));
                setBarcode('');
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
        </ModalShell>
      </Modal>
    </div>
  );
}
