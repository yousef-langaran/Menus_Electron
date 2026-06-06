import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, Modal, ModalBody, ModalFooter, ModalHeader } from '@heroui/react';
import { Button } from '../../ui/compat-button';
import { Input } from '../../ui/compat-input';
import { ModalShell } from '../../ui/modal-shell';
import { useAuthStore } from '../../store/authStore';
import { useSyncStore } from '../../store/syncStore';
import { accountingDb, createSupplierLocal, deleteSupplierLocal, updateSupplierLocal } from '../../services/accountingLocalDb';
import { toast } from '../../utils/toast';

export default function AccountingSuppliersPage() {
  const navigate = useNavigate();
  const { user, token } = useAuthStore();
  const restaurantId = user?.restaurants?.[0]?.id ? Number(user.restaurants[0].id) : undefined;
  const isOnline = useSyncStore((s) => s.isOnline);
  const lastSyncedAt = useSyncStore((s) => s.lastSyncedAt);

  const [rows, setRows] = useState<any[]>([]);
  const [search, setSearch] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [saving, setSaving] = useState(false);

  const reload = async () => {
    if (!restaurantId) return;
    const data = await accountingDb.suppliers.where('restaurantId').equals(restaurantId).reverse().sortBy('id');
    setRows(data);
  };

  useEffect(() => { void reload(); }, [restaurantId]);
  useEffect(() => { if (lastSyncedAt) void reload(); }, [lastSyncedAt]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((x) => String(x.name || '').toLowerCase().includes(q) || String(x.phone || '').includes(q));
  }, [rows, search]);

  return (
    <div className="min-h-screen bg-default-100 p-6 space-y-4">
      <div className="flex justify-between items-center">
        <div className="flex items-center gap-2">
          <h1 className="text-xl font-bold">تامین‌کنندگان</h1>
          <span className={`text-xs rounded-full px-2 py-0.5 font-medium ${isOnline ? 'bg-success-100 text-success-700' : 'bg-default-200 text-default-500'}`}>
            {isOnline ? '● آنلاین' : '○ در انتظار اتصال'}
          </span>
        </div>
        <div className="flex gap-2">
          <Button variant="flat" onPress={() => navigate('/accounting')}>بازگشت</Button>
          <Button color="primary" onPress={() => { setName(''); setPhone(''); setCreateOpen(true); }}>ثبت تامین‌کننده</Button>
        </div>
      </div>

      {!isOnline && (
        <div className="bg-warning-50 border border-warning-200 rounded-lg p-3 text-sm text-warning-700">
          اتصال به سرور برقرار نیست — تغییرات ذخیره می‌شوند و پس از برقراری اتصال همگام‌سازی خواهند شد.
        </div>
      )}

      <Card>
        <CardContent className="gap-3">
          <Input placeholder="جستجو (نام/تلفن)" value={search} onValueChange={setSearch} />
          {filtered.length === 0 && (
            <p className="text-center text-sm text-default-500 py-4">تامین‌کننده‌ای ثبت نشده است.</p>
          )}
          {filtered.map((s) => (
            <div key={s.id} className="text-sm bg-default-50 border border-default-200 rounded-lg p-3 flex justify-between items-center">
              <span className="font-medium">{s.name}{s.phone ? ` (${s.phone})` : ''}</span>
              <div className="flex gap-1">
                <Button size="sm" variant="flat" onPress={() => { setEditId(s.id); setName(s.name); setPhone(s.phone || ''); setEditOpen(true); }}>ویرایش</Button>
                <Button size="sm" color="danger" variant="light" onPress={async () => {
                  if (!restaurantId) return;
                  if (!window.confirm(`تامین‌کننده «${s.name}» حذف شود؟`)) return;
                  await deleteSupplierLocal({ id: s.id, restaurantId });
                  toast.success('حذف شد');
                  await reload();
                }}>حذف</Button>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      <Modal isOpen={createOpen} onOpenChange={setCreateOpen}>
        <ModalShell size="md">
          <ModalHeader>ثبت تامین‌کننده</ModalHeader>
          <ModalBody className="gap-3">
            <Input label="نام" value={name} onValueChange={setName} isRequired autoFocus />
            <Input label="تلفن" value={phone} onValueChange={setPhone} />
          </ModalBody>
          <ModalFooter>
            <Button variant="flat" onPress={() => setCreateOpen(false)}>انصراف</Button>
            <Button color="primary" isLoading={saving} isDisabled={!name.trim()} onPress={async () => {
              if (!restaurantId || !name.trim()) return;
              setSaving(true);
              try {
                await createSupplierLocal({ restaurantId, name: name.trim(), phone: phone.trim() || undefined });
                toast.success('تامین‌کننده ثبت شد');
                setName(''); setPhone(''); setCreateOpen(false); await reload();
              } catch { toast.error('خطا در ثبت'); } finally { setSaving(false); }
            }}>ثبت</Button>
          </ModalFooter>
        </ModalShell>
      </Modal>

      <Modal isOpen={editOpen} onOpenChange={setEditOpen}>
        <ModalShell size="md">
          <ModalHeader>ویرایش تامین‌کننده</ModalHeader>
          <ModalBody className="gap-3">
            <Input label="نام" value={name} onValueChange={setName} isRequired autoFocus />
            <Input label="تلفن" value={phone} onValueChange={setPhone} />
          </ModalBody>
          <ModalFooter>
            <Button variant="flat" onPress={() => setEditOpen(false)}>انصراف</Button>
            <Button color="primary" isLoading={saving} isDisabled={!name.trim()} onPress={async () => {
              if (!restaurantId || !editId || !name.trim()) return;
              setSaving(true);
              try {
                await updateSupplierLocal({ id: editId, restaurantId, patch: { name: name.trim(), phone: phone.trim() || null } });
                toast.success('ویرایش شد');
                setEditOpen(false); await reload();
              } catch { toast.error('خطا در ویرایش'); } finally { setSaving(false); }
            }}>ذخیره</Button>
          </ModalFooter>
        </ModalShell>
      </Modal>
    </div>
  );
}
