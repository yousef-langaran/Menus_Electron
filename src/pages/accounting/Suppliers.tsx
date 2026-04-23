import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button, Card, CardBody, Input, Modal, ModalBody, ModalContent, ModalFooter, ModalHeader } from '@heroui/react';
import { useAuthStore } from '../../store/authStore';
import { accountingDb, createSupplierLocal, deleteSupplierLocal, updateSupplierLocal } from '../../services/accountingLocalDb';

export default function AccountingSuppliersPage() {
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const restaurantId = user?.restaurants?.[0]?.id;
  const [rows, setRows] = useState<any[]>([]);
  const [search, setSearch] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');

  const reload = async () => {
    if (!restaurantId) return;
    const data = await accountingDb.suppliers.where('restaurantId').equals(restaurantId).reverse().sortBy('id');
    setRows(data);
  };
  useEffect(() => { void reload(); }, [restaurantId]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((x) => String(x.name || '').toLowerCase().includes(q) || String(x.phone || '').includes(q));
  }, [rows, search]);

  return (
    <div className="min-h-screen bg-default-100 p-6 space-y-4">
      <div className="flex justify-between items-center">
        <h1 className="text-xl font-bold">تامین‌کنندگان</h1>
        <div className="flex gap-2">
          <Button variant="flat" onPress={() => navigate('/accounting')}>بازگشت</Button>
          <Button color="primary" onPress={() => setCreateOpen(true)}>ثبت تامین‌کننده</Button>
        </div>
      </div>
      <Card>
        <CardBody className="gap-3">
          <Input placeholder="جستجو (نام/تلفن)" value={search} onValueChange={setSearch} />
          {filtered.map((s) => (
            <div key={s.id} className="text-sm bg-default-100 rounded p-2 flex justify-between items-center">
              <span>{s.name} {s.phone ? `(${s.phone})` : ''}</span>
              <div className="flex gap-1">
                <Button size="sm" variant="flat" onPress={() => { setEditId(s.id); setName(s.name); setEditOpen(true); }}>ویرایش</Button>
                <Button size="sm" color="danger" variant="light" onPress={async () => { if (!restaurantId) return; await deleteSupplierLocal({ id: s.id, restaurantId }); await reload(); }}>حذف</Button>
              </div>
            </div>
          ))}
        </CardBody>
      </Card>
      <Modal isOpen={createOpen} onOpenChange={setCreateOpen}>
        <ModalContent>
          <ModalHeader>ثبت تامین‌کننده</ModalHeader>
          <ModalBody className="gap-3">
            <Input label="نام" value={name} onValueChange={setName} />
            <Input label="تلفن" value={phone} onValueChange={setPhone} />
          </ModalBody>
          <ModalFooter>
            <Button variant="flat" onPress={() => setCreateOpen(false)}>انصراف</Button>
            <Button color="primary" onPress={async () => {
              if (!restaurantId || !name.trim()) return;
              await createSupplierLocal({ restaurantId, name: name.trim(), phone });
              setName(''); setPhone(''); setCreateOpen(false); await reload();
            }}>ثبت</Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
      <Modal isOpen={editOpen} onOpenChange={setEditOpen}>
        <ModalContent>
          <ModalHeader>ویرایش تامین‌کننده</ModalHeader>
          <ModalBody><Input label="نام جدید" value={name} onValueChange={setName} /></ModalBody>
          <ModalFooter>
            <Button variant="flat" onPress={() => setEditOpen(false)}>انصراف</Button>
            <Button color="primary" onPress={async () => {
              if (!restaurantId || !editId || !name.trim()) return;
              await updateSupplierLocal({ id: editId, restaurantId, patch: { name: name.trim() } });
              setEditOpen(false); await reload();
            }}>ذخیره</Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </div>
  );
}
