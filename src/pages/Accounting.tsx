import { useNavigate } from 'react-router-dom';
import { Card, CardContent } from '@heroui/react';
import { Button } from '../ui/compat-button';
import { Select, SelectItem } from '../ui/compat-select';
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
      <header className="shrink-0 bg-content1 border-b border-default-200 px-4 py-3 shadow-sm">
        <h1 className="text-lg sm:text-xl font-bold text-foreground">حسابداری (آفلاین)</h1>
      </header>

      <div className="p-6 max-w-5xl mx-auto w-full space-y-4">
        <Card>
          <CardContent className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-sm">
            <div className="bg-default-100 rounded-lg p-2">عملیات صف: {pendingOps}</div>
            <div className="bg-default-100 rounded-lg p-2">ناموفق: {failedOps}</div>
            <div className="bg-default-100 rounded-lg p-2">در حال سینک: {isSyncing ? 'بله' : 'خیر'}</div>
            <div className="bg-default-100 rounded-lg p-2">
              آخرین سینک: {lastSyncedAt ? new Date(lastSyncedAt).toLocaleString('fa-IR') : '—'}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex flex-col gap-3">
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
          </CardContent>
        </Card>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
          <Card>
            <CardContent className="gap-2">
              <h3 className="font-semibold">مواد اولیه</h3>
              <p className="text-sm text-default-500">ثبت، جستجو و ویرایش مواد اولیه</p>
              <Button color="primary" onPress={() => navigate('/accounting/raw-materials')}>ورود</Button>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="gap-2">
              <h3 className="font-semibold">تامین‌کنندگان</h3>
              <p className="text-sm text-default-500">ثبت، جستجو و ویرایش تامین‌کننده</p>
              <Button color="primary" onPress={() => navigate('/accounting/suppliers')}>ورود</Button>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="gap-2">
              <h3 className="font-semibold">فاکتورهای خرید</h3>
              <p className="text-sm text-default-500">ثبت پیش‌نویس، مشاهده و تایید فاکتورهای خرید</p>
              <Button color="primary" onPress={() => navigate('/accounting/purchase-drafts')}>ورود</Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
