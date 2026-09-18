import { useEffect, useState } from 'react';
import { Card, CardContent, Chip } from '@heroui/react';
import { Button } from '../ui/compat-button';
import { Input } from '../ui/compat-input';
import { Textarea } from '../ui/compat-textarea';
import { useAuthStore } from '../store/authStore';
import { usePosShiftStore } from '../store/posShiftStore';
import type { PosShiftReport } from '../services/api';
import { pulseCashDrawer } from '../utils/cashDrawer';
import { toast } from '../utils/toast';

function formatAmount(n: number | null | undefined) {
  return new Intl.NumberFormat('fa-IR').format(Number(n) || 0) + ' ریال';
}

function formatDateTime(iso: string | null | undefined) {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString('fa-IR');
  } catch {
    return iso;
  }
}

function ReportView({ report }: { report: PosShiftReport }) {
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2 text-sm">
        <div>جمع فروش: <strong>{formatAmount(report.totals.salesAmount)}</strong> ({report.totals.salesCount} فقره)</div>
        <div>جمع مرجوعی: <strong>{formatAmount(report.totals.refundsAmount)}</strong> ({report.totals.refundsCount} فقره)</div>
        <div className="col-span-2">خالص: <strong>{formatAmount(report.totals.netAmount)}</strong></div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="border-b border-border-secondary">
              <th className="text-right py-1">روش پرداخت</th>
              <th className="text-right py-1">فروش</th>
              <th className="text-right py-1">مرجوعی</th>
              <th className="text-right py-1">خالص</th>
            </tr>
          </thead>
          <tbody>
            {report.paymentMethodBreakdown.map((row) => (
              <tr key={row.paymentMethod} className="border-b border-border">
                <td className="py-1">{row.paymentMethod}</td>
                <td className="py-1">{formatAmount(row.salesAmount)}</td>
                <td className="py-1">{formatAmount(row.refundsAmount)}</td>
                <td className="py-1">{formatAmount(row.netAmount)}</td>
              </tr>
            ))}
            {report.paymentMethodBreakdown.length === 0 && (
              <tr>
                <td colSpan={4} className="py-3 text-center text-muted">
                  تراکنشی در این شیفت ثبت نشده است
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {report.type === 'z' && (
        <div className="grid grid-cols-2 gap-2 text-sm border-t border-border-secondary pt-3">
          <div>ته‌صندوق اولیه: <strong>{formatAmount(report.openingFloatAmount)}</strong></div>
          <div>مبلغ مورد انتظار: <strong>{formatAmount(report.expectedCashAmount)}</strong></div>
          <div>مبلغ شمارش‌شده: <strong>{formatAmount(report.countedCashAmount)}</strong></div>
          <div>
            مغایرت:{' '}
            <strong className={Number(report.varianceAmount) < 0 ? 'text-danger' : 'text-success'}>
              {formatAmount(report.varianceAmount)}
            </strong>
          </div>
        </div>
      )}
    </div>
  );
}

export default function PosShiftPage() {
  const { user, token } = useAuthStore();
  const restaurantId = user?.restaurants?.[0]?.id;
  const { currentShift, loading, error, loadCurrentShift, openShift, closeShift, fetchReport, clearError } =
    usePosShiftStore();

  const [openingFloatAmount, setOpeningFloatAmount] = useState('');
  const [openingNotes, setOpeningNotes] = useState('');
  const [countedCashAmount, setCountedCashAmount] = useState('');
  const [closingNotes, setClosingNotes] = useState('');
  const [showCloseForm, setShowCloseForm] = useState(false);
  const [report, setReport] = useState<PosShiftReport | null>(null);
  const [reportLoading, setReportLoading] = useState(false);
  const [drawerBusy, setDrawerBusy] = useState(false);

  useEffect(() => {
    if (restaurantId && token) {
      void loadCurrentShift(restaurantId, token);
    }
  }, [restaurantId, token, loadCurrentShift]);

  const handleOpenShift = async () => {
    if (!restaurantId || !token) return;
    const amount = Number(String(openingFloatAmount).replace(/,/g, ''));
    if (!Number.isFinite(amount) || amount < 0) {
      toast.error('مبلغ ته‌صندوق را درست وارد کنید');
      return;
    }
    const result = await openShift({
      restaurantId,
      openingFloatAmount: amount,
      openingNotes: openingNotes.trim() || undefined,
      token,
    });
    if (result.success) {
      toast.success('شیفت باز شد');
      setOpeningFloatAmount('');
      setOpeningNotes('');
    } else {
      toast.error(result.error || 'باز کردن شیفت ناموفق بود');
    }
  };

  const handleCloseShift = async () => {
    if (!token) return;
    const amount = Number(String(countedCashAmount).replace(/,/g, ''));
    if (!Number.isFinite(amount) || amount < 0) {
      toast.error('مبلغ شمارش‌شده را درست وارد کنید');
      return;
    }
    const result = await closeShift({ countedCashAmount: amount, closingNotes: closingNotes.trim() || undefined, token });
    if (result.success) {
      toast.success('شیفت بسته شد');
      setShowCloseForm(false);
      setCountedCashAmount('');
      setClosingNotes('');
      if (result.shift && !result.shift.pendingSync && result.shift.id != null && token) {
        setReportLoading(true);
        const z = await fetchReport('z', token);
        setReport(z);
        setReportLoading(false);
      }
    } else {
      toast.error(result.error || 'بستن شیفت ناموفق بود');
    }
  };

  const handleFetchXReport = async () => {
    if (!token) return;
    if (!currentShift || currentShift.id == null) {
      toast.error('گزارش لحظه‌ای فقط بعد از همگام‌سازی شیفت با سرور در دسترس است');
      return;
    }
    setReportLoading(true);
    const x = await fetchReport('x', token);
    setReport(x);
    setReportLoading(false);
    if (!x) toast.error('دریافت گزارش ناموفق بود');
  };

  const handleOpenDrawer = async () => {
    setDrawerBusy(true);
    const result = await pulseCashDrawer();
    setDrawerBusy(false);
    if (result.success) {
      toast.success('دستور باز کردن کشو ارسال شد');
    } else {
      toast.error(`باز کردن کشو ناموفق بود (${result.error || 'خطای نامشخص'})`);
    }
  };

  return (
    <div className="min-h-screen bg-background p-4 space-y-4" dir="rtl">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-bold">شیفت صندوق</h1>
        <Button variant="flat" color="secondary" onPress={handleOpenDrawer} isDisabled={drawerBusy}>
          {drawerBusy ? 'در حال باز کردن...' : 'باز کردن کشو'}
        </Button>
      </div>

      {error && (
        <div className="bg-danger-soft border border-danger/30 text-danger-soft-foreground rounded-lg p-3 flex items-center justify-between text-sm">
          <span>{error}</span>
          <Button variant="light" size="sm" onPress={clearError}>بستن</Button>
        </div>
      )}

      {!currentShift && (
        <Card>
          <CardContent className="p-4 space-y-3">
            <h2 className="font-semibold">باز کردن شیفت جدید</h2>
            <Input
              label="مبلغ اولیهٔ ته‌صندوق (ریال)"
              value={openingFloatAmount}
              onChange={(e: any) => setOpeningFloatAmount(e.target.value)}
              type="number"
            />
            <Textarea
              label="یادداشت (اختیاری)"
              value={openingNotes}
              onChange={(e: any) => setOpeningNotes(e.target.value)}
            />
            <Button color="primary" onPress={handleOpenShift} isDisabled={loading}>
              {loading ? 'در حال باز کردن...' : 'باز کردن شیفت'}
            </Button>
          </CardContent>
        </Card>
      )}

      {currentShift && (
        <Card>
          <CardContent className="p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold">
                شیفت {currentShift.status === 'open' ? 'باز' : 'بسته‌شده'}
                {currentShift.pendingSync && (
                  <Chip size="sm" color="warning" variant="soft" className="mr-2 align-middle">
                    در انتظار همگام‌سازی
                  </Chip>
                )}
              </h2>
              {currentShift.status === 'open' && (
                <Button variant="flat" color="secondary" size="sm" onPress={handleFetchXReport} isDisabled={reportLoading}>
                  گزارش X (لحظه‌ای)
                </Button>
              )}
            </div>

            <div className="grid grid-cols-2 gap-2 text-sm">
              <div>ته‌صندوق اولیه: <strong>{formatAmount(currentShift.openingFloatAmount)}</strong></div>
              <div>زمان باز شدن: <strong>{formatDateTime(currentShift.openedAt)}</strong></div>
              {currentShift.status === 'closed' && (
                <>
                  <div>مبلغ شمارش‌شده: <strong>{formatAmount(currentShift.countedCashAmount)}</strong></div>
                  <div>زمان بستن: <strong>{formatDateTime(currentShift.closedAt)}</strong></div>
                  {currentShift.varianceAmount != null && (
                    <div className="col-span-2">
                      مغایرت:{' '}
                      <strong className={currentShift.varianceAmount < 0 ? 'text-danger' : 'text-success'}>
                        {formatAmount(currentShift.varianceAmount)}
                      </strong>
                    </div>
                  )}
                </>
              )}
            </div>

            {currentShift.status === 'open' && !showCloseForm && (
              <Button color="danger" onPress={() => setShowCloseForm(true)}>
                بستن شیفت
              </Button>
            )}

            {currentShift.status === 'open' && showCloseForm && (
              <div className="space-y-3 border-t border-border-secondary pt-3">
                <Input
                  label="مبلغ نقد شمارش‌شده (ریال)"
                  value={countedCashAmount}
                  onChange={(e: any) => setCountedCashAmount(e.target.value)}
                  type="number"
                />
                <Textarea
                  label="یادداشت بستن (اختیاری)"
                  value={closingNotes}
                  onChange={(e: any) => setClosingNotes(e.target.value)}
                />
                <div className="flex gap-2">
                  <Button color="danger" onPress={handleCloseShift} isDisabled={loading}>
                    {loading ? 'در حال بستن...' : 'تأیید بستن شیفت'}
                  </Button>
                  <Button variant="light" onPress={() => setShowCloseForm(false)}>انصراف</Button>
                </div>
              </div>
            )}

            {currentShift.status === 'closed' && !currentShift.pendingSync && (
              <Button variant="flat" color="secondary" size="sm" onPress={async () => {
                if (!token) return;
                setReportLoading(true);
                const z = await fetchReport('z', token);
                setReport(z);
                setReportLoading(false);
              }}>
                گزارش Z (پایان شیفت)
              </Button>
            )}
          </CardContent>
        </Card>
      )}

      {reportLoading && <div className="text-center text-muted text-sm">در حال دریافت گزارش...</div>}

      {report && !reportLoading && (
        <Card>
          <CardContent className="p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold">{report.type === 'x' ? 'گزارش X (لحظه‌ای)' : 'گزارش Z (پایان شیفت)'}</h2>
              <Button variant="ghost" size="sm" onPress={() => setReport(null)}>بستن</Button>
            </div>
            <ReportView report={report} />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
