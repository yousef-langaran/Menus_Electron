import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent } from '@heroui/react';
import { Button } from '../../ui/compat-button';
import { useAuthStore } from '../../store/authStore';
import { fetchAccountingPurchaseReport, updateAccountingPurchaseInvoiceStatus } from '../../services/api';
import { useFiscalYearStore } from '../../store/fiscalYearStore';

export default function AccountingServerPurchasesPage() {
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const token = useAuthStore((s) => s.token);
  const restaurantId = user?.restaurants?.[0]?.id;
  const selectedFiscalYearId = useFiscalYearStore((s) =>
    restaurantId ? s.selectedByRestaurant[restaurantId] : undefined,
  );
  const [rows, setRows] = useState<any[]>([]);

  const reload = async () => {
    if (!restaurantId || !token) return;
    try {
      const data = await fetchAccountingPurchaseReport(
        { restaurantId, fiscalYearId: selectedFiscalYearId },
        token,
      );
      setRows(data.rows || []);
    } catch {
      setRows([]);
    }
  };
  useEffect(() => { void reload(); }, [restaurantId, token, selectedFiscalYearId]);

  return (
    <div className="min-h-screen bg-default-100 p-6 space-y-4">
      <div className="flex justify-between items-center">
        <h1 className="text-xl font-bold">فاکتورهای خرید سرور</h1>
        <Button variant="flat" onPress={() => navigate('/accounting')}>بازگشت</Button>
      </div>
      <Card>
        <CardContent className="gap-2">
          {rows.length === 0 ? <p className="text-sm text-default-500">موردی یافت نشد.</p> : rows.map((r) => (
            <div key={r.id} className="text-sm bg-default-100 rounded p-2 flex justify-between items-center">
              <span>{r.invoiceNumber} | {r.supplierName} | {r.status} | بدهی: {r.debtAmount}</span>
              {r.status === 'pending_approval' && token ? (
                <div className="flex gap-1">
                  <Button size="sm" color="success" variant="flat" onPress={async () => { if (!restaurantId) return; await updateAccountingPurchaseInvoiceStatus(r.id, { restaurantId, status: 'approved' }, token); await reload(); }}>تایید</Button>
                  <Button size="sm" color="danger" variant="flat" onPress={async () => { if (!restaurantId) return; await updateAccountingPurchaseInvoiceStatus(r.id, { restaurantId, status: 'rejected' }, token); await reload(); }}>رد</Button>
                </div>
              ) : null}
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
