import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, Modal, ModalBody, ModalFooter, ModalHeader } from '@heroui/react';
import { Button } from '../../ui/compat-button';
import { Input } from '../../ui/compat-input';
import { ModalShell } from '../../ui/modal-shell';
import { Select, SelectItem } from '../../ui/compat-select';
import { useAuthStore } from '../../store/authStore';
import { accountingDb, createRawMaterialLocal, deleteRawMaterialLocal, updateRawMaterialLocal } from '../../services/accountingLocalDb';

const UNITS = ['gram', 'kilogram', 'liter', 'milliliter', 'piece', 'pack'];

export default function AccountingRawMaterialsPage() {
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const restaurantId = user?.restaurants?.[0]?.id;
  const [rows, setRows] = useState<any[]>([]);
  const [search, setSearch] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [name, setName] = useState('');
  const [unit, setUnit] = useState('gram');
  const [minStock, setMinStock] = useState('0');

  const reload = async () => {
    if (!restaurantId) return;
    const data = await accountingDb.rawMaterials.where('restaurantId').equals(restaurantId).reverse().sortBy('id');
    setRows(data);
  };
  useEffect(() => {
    void reload();
  }, [restaurantId]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((x) => String(x.name || '').toLowerCase().includes(q) || String(x.barcode || '').includes(q));
  }, [rows, search]);

  return (
    <div className="min-h-screen bg-default-100 p-6 space-y-4">
      <div className="flex justify-between items-center">
        <h1 className="text-xl font-bold">مواد اولیه</h1>
        <div className="flex gap-2">
          <Button variant="flat" onPress={() => navigate('/accounting')}>بازگشت</Button>
          <Button color="primary" onPress={() => setCreateOpen(true)}>ثبت ماده اولیه</Button>
        </div>
      </div>
      <Card>
        <CardContent className="gap-3">
          <Input placeholder="جستجو (نام/بارکد)" value={search} onValueChange={setSearch} />
          {filtered.map((m) => (
            <div key={m.id} className="text-sm bg-default-100 rounded p-2 flex justify-between items-center">
              <span>{m.name} | موجودی: {m.currentStock} | حداقل: {m.minStock}</span>
              <div className="flex gap-1">
                <Button size="sm" variant="flat" onPress={() => { setEditId(m.id); setName(m.name); setEditOpen(true); }}>ویرایش</Button>
                <Button size="sm" color="danger" variant="light" onPress={async () => { if (!restaurantId) return; await deleteRawMaterialLocal({ id: m.id, restaurantId }); await reload(); }}>حذف</Button>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      <Modal isOpen={createOpen} onOpenChange={setCreateOpen}>
        <ModalShell size="md">
          <ModalHeader>ثبت ماده اولیه</ModalHeader>
          <ModalBody className="gap-3">
            <Input label="نام" value={name} onValueChange={setName} />
            <Select label="واحد" selectedKeys={[unit]} onSelectionChange={(k) => setUnit(String(Array.from(k)[0] || 'gram'))}>
              {UNITS.map((u) => <SelectItem key={u}>{u}</SelectItem>)}
            </Select>
            <Input type="number" label="حداقل موجودی" value={minStock} onValueChange={setMinStock} />
          </ModalBody>
          <ModalFooter>
            <Button variant="flat" onPress={() => setCreateOpen(false)}>انصراف</Button>
            <Button color="primary" onPress={async () => {
              if (!restaurantId || !name.trim()) return;
              await createRawMaterialLocal({ restaurantId, name: name.trim(), unit, minStock: Number(minStock || 0), currentStock: 0 });
              setName(''); setMinStock('0'); setCreateOpen(false); await reload();
            }}>ثبت</Button>
          </ModalFooter>
        </ModalShell>
      </Modal>

      <Modal isOpen={editOpen} onOpenChange={setEditOpen}>
        <ModalShell size="md">
          <ModalHeader>ویرایش ماده اولیه</ModalHeader>
          <ModalBody><Input label="نام جدید" value={name} onValueChange={setName} /></ModalBody>
          <ModalFooter>
            <Button variant="flat" onPress={() => setEditOpen(false)}>انصراف</Button>
            <Button color="primary" onPress={async () => {
              if (!restaurantId || !editId || !name.trim()) return;
              await updateRawMaterialLocal({ id: editId, restaurantId, patch: { name: name.trim() } });
              setEditOpen(false); await reload();
            }}>ذخیره</Button>
          </ModalFooter>
        </ModalShell>
      </Modal>
    </div>
  );
}
