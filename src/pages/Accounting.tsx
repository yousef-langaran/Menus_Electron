import { useNavigate } from 'react-router-dom';
import { Button, Card, CardBody, Select, SelectItem } from '@heroui/react';
import { useSyncStore } from '../store/syncStore';
import { useAuthStore } from '../store/authStore';
import { closeFiscalYear, listFiscalYears, setActiveFiscalYear } from '../services/api';
import { useEffect, useState } from 'react';
import { useFiscalYearStore } from '../store/fiscalYearStore';

export default function AccountingPage() {
  const navigate = useNavigate();
  const { pendingOps, failedOps, isSyncing, lastSyncedAt } = useSyncStore();
  const { user, token } = useAuthStore();
  const restaurantId = user?.restaurants?.[0]?.id;
  const [fiscalYears, setFiscalYears] = useState<any[]>([]);
  const { selectedByRestaurant, setSelectedFiscalYear } = useFiscalYearStore();
  const selectedFiscalYearId = restaurantId ? selectedByRestaurant[restaurantId] : undefined;

  useEffect(() => {
    const load = async () => {
      if (!restaurantId || !token) return;
      try {
        const rows = await listFiscalYears(restaurantId, token);
        setFiscalYears(rows);
        const active = rows.find((x) => x.isActive && x.status === 'open')?.id;
        if (active) setSelectedFiscalYear(restaurantId, active);
      } catch {
        setFiscalYears([]);
      }
    };
    void load();
  }, [restaurantId, token, setSelectedFiscalYear]);

  return (
    <div className="min-h-screen flex flex-col bg-default-100">
      <header className="bg-content1 border-b border-default-200 px-6 py-4 flex justify-between items-center shadow-sm">
        <h1 className="text-xl font-bold text-foreground">حسابداری (آفلاین)</h1>
        <div className="flex gap-2">
          <Button variant="flat" color="default" onPress={() => navigate('/order')}>
            ثبت سفارش
          </Button>
          <Button variant="flat" color="default" onPress={() => navigate('/settings')}>
            تنظیمات
          </Button>
        </div>
      </header>

      <div className="p-6 max-w-5xl mx-auto w-full space-y-4">
        <Card>
          <CardBody className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-sm">
            <div className="bg-default-100 rounded-lg p-2">عملیات صف: {pendingOps}</div>
            <div className="bg-default-100 rounded-lg p-2">ناموفق: {failedOps}</div>
            <div className="bg-default-100 rounded-lg p-2">در حال سینک: {isSyncing ? 'بله' : 'خیر'}</div>
            <div className="bg-default-100 rounded-lg p-2">
              آخرین سینک: {lastSyncedAt ? new Date(lastSyncedAt).toLocaleString('fa-IR') : '—'}
            </div>
          </CardBody>
        </Card>
        <Card>
          <CardBody className="flex flex-col gap-3">
            <h3 className="font-semibold">سال مالی فعال</h3>
            <Select
              label="سال مالی"
              selectedKeys={selectedFiscalYearId ? [String(selectedFiscalYearId)] : []}
              onSelectionChange={async (k) => {
                if (!restaurantId || !token) return;
                const fiscalYearId = Number(Array.from(k)[0] || 0);
                if (!fiscalYearId) return;
                await setActiveFiscalYear(fiscalYearId, restaurantId, token);
                setSelectedFiscalYear(restaurantId, fiscalYearId);
              }}
            >
              {fiscalYears.filter((x) => x.status === 'open').map((x) => (
                <SelectItem key={String(x.id)}>{x.name}</SelectItem>
              ))}
            </Select>
            {selectedFiscalYearId ? (
              <Button
                color="danger"
                variant="flat"
                onPress={async () => {
                  if (!restaurantId || !token || !selectedFiscalYearId) return;
                  await closeFiscalYear(selectedFiscalYearId, restaurantId, token);
                  const rows = await listFiscalYears(restaurantId, token);
                  setFiscalYears(rows);
                  const nextOpen = rows.find((x) => x.isActive && x.status === 'open')?.id;
                  setSelectedFiscalYear(restaurantId, nextOpen);
                }}
              >
                بستن سال مالی فعال
              </Button>
            ) : null}
          </CardBody>
        </Card>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
          <Card>
            <CardBody className="gap-2">
              <h3 className="font-semibold">مواد اولیه</h3>
              <p className="text-sm text-default-500">ثبت، جستجو و ویرایش مواد اولیه</p>
              <Button color="primary" onPress={() => navigate('/accounting/raw-materials')}>ورود</Button>
            </CardBody>
          </Card>
          <Card>
            <CardBody className="gap-2">
              <h3 className="font-semibold">تامین‌کنندگان</h3>
              <p className="text-sm text-default-500">ثبت، جستجو و ویرایش تامین‌کننده</p>
              <Button color="primary" onPress={() => navigate('/accounting/suppliers')}>ورود</Button>
            </CardBody>
          </Card>
          <Card>
            <CardBody className="gap-2">
              <h3 className="font-semibold">پیش‌نویس‌های خرید</h3>
              <p className="text-sm text-default-500">ثبت و مدیریت پیش‌نویس فاکتور خرید</p>
              <Button color="primary" onPress={() => navigate('/accounting/purchase-drafts')}>ورود</Button>
            </CardBody>
          </Card>
          <Card>
            <CardBody className="gap-2">
              <h3 className="font-semibold">فاکتورهای سرور</h3>
              <p className="text-sm text-default-500">مشاهده، تایید و رد فاکتورهای خرید سرور</p>
              <Button color="primary" onPress={() => navigate('/accounting/server-purchases')}>ورود</Button>
            </CardBody>
          </Card>
        </div>
      </div>
    </div>
  );
}
