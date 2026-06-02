import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, Modal, ModalBody, ModalFooter, ModalHeader } from '@heroui/react';
import { Button } from '../../ui/compat-button';
import { Input } from '../../ui/compat-input';
import { Select, SelectItem } from '../../ui/compat-select';
import { ModalShell } from '../../ui/modal-shell';
import { useAuthStore } from '../../store/authStore';
import { toShamsiDate, toShamsiTime } from '../../utils/date';
import { ShamsiDatePicker } from '../../ui/ShamsiDatePicker';
import {
  accountingDb,
  accountTypeLabel,
  CashAccountTransaction,
  CashAccountType,
  getAllCashAccountsSummary,
  recordCashTransaction,
} from '../../services/accountingLocalDb';
import { toast } from '../../utils/toast';

const TRANSACTION_TYPE_LABELS: Record<string, string> = {
  sale_income: 'فروش',
  credit_payment: 'دریافت نسیه',
  expense_payment: 'پرداخت هزینه',
  purchase_payment: 'پرداخت خرید',
  manual_in: 'ورودی دستی',
  manual_out: 'خروجی دستی',
};

function formatAmount(n: number) {
  const abs = Math.abs(n);
  const formatted = Number(abs).toLocaleString('fa-IR');
  return n >= 0 ? `+${formatted}` : `-${formatted}`;
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

const ACCOUNT_TYPES: { value: CashAccountType | 'all'; label: string }[] = [
  { value: 'all', label: 'همه حساب‌ها' },
  { value: 'cash', label: 'صندوق' },
  { value: 'card', label: 'کارتخوان' },
  { value: 'online', label: 'آنلاین' },
  { value: 'bank', label: 'بانک' },
];

export default function CashAccountsPage() {
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const restaurantId = user?.restaurants?.[0]?.id ? Number(user.restaurants[0].id) : undefined;

  const [summary, setSummary] = useState<Array<{ accountType: CashAccountType; accountName: string; balance: number; txCount: number }>>([]);
  const [transactions, setTransactions] = useState<CashAccountTransaction[]>([]);
  const [filterAccount, setFilterAccount] = useState<CashAccountType | 'all'>('all');
  const [filterFrom, setFilterFrom] = useState('');
  const [filterTo, setFilterTo] = useState(todayIso());
  const [loading, setLoading] = useState(false);

  // Manual transaction modal
  const [manualOpen, setManualOpen] = useState(false);
  const [manualAccountType, setManualAccountType] = useState<CashAccountType>('cash');
  const [manualType, setManualType] = useState<'manual_in' | 'manual_out'>('manual_in');
  const [manualAmount, setManualAmount] = useState('');
  const [manualDesc, setManualDesc] = useState('');
  const [manualSaving, setManualSaving] = useState(false);

  const reload = useCallback(async () => {
    if (!restaurantId) return;
    setLoading(true);
    try {
      const s = await getAllCashAccountsSummary(restaurantId);
      setSummary(s);

      let rows = await accountingDb.cashAccountTransactions
        .where('restaurantId').equals(restaurantId)
        .reverse().sortBy('createdAt') as CashAccountTransaction[];

      if (filterAccount !== 'all') rows = rows.filter((r) => r.accountType === filterAccount);
      if (filterFrom) rows = rows.filter((r) => r.date >= filterFrom);
      if (filterTo) rows = rows.filter((r) => r.date <= filterTo);
      setTransactions(rows);
    } finally {
      setLoading(false);
    }
  }, [restaurantId, filterAccount, filterFrom, filterTo]);

  useEffect(() => { void reload(); }, [reload]);

  const handleManualSave = async () => {
    if (!restaurantId || !manualAmount || !manualAccountType) return;
    const amt = Number(String(manualAmount).replace(/,/g, ''));
    if (isNaN(amt) || amt <= 0) return;
    setManualSaving(true);
    try {
      await recordCashTransaction({
        restaurantId,
        accountType: manualAccountType,
        accountName: accountTypeLabel(manualAccountType),
        transactionType: manualType,
        amount: manualType === 'manual_in' ? amt : -amt,
        description: manualDesc.trim() || undefined,
        date: todayIso(),
      });
      toast.success('تراکنش ثبت شد');
      setManualOpen(false);
      setManualAmount('');
      setManualDesc('');
      await reload();
    } catch (_e: unknown) {
      toast.error('خطا در ثبت تراکنش');
    } finally {
      setManualSaving(false);
    }
  };

  const totalBalance = summary.reduce((sum, s) => sum + s.balance, 0);

  return (
    <div className="min-h-screen bg-default-100 p-4 space-y-4">
      {/* هدر */}
      <div className="flex flex-wrap justify-between items-center gap-2">
        <h1 className="text-xl font-bold text-foreground">صندوق و حساب‌های دریافت</h1>
        <div className="flex gap-2">
          <Button variant="flat" onPress={() => navigate('/accounting')}>بازگشت</Button>
          <Button color="primary" onPress={() => setManualOpen(true)}>ثبت دستی</Button>
        </div>
      </div>

      {/* کارت‌های خلاصه حساب‌ها */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {summary.map((s) => (
          <Card
            key={s.accountType}
            isPressable
            className={`cursor-pointer border-2 transition-all ${filterAccount === s.accountType ? 'border-primary-500' : 'border-transparent'}`}
            onPress={() => setFilterAccount(filterAccount === s.accountType ? 'all' : s.accountType)}
          >
            <CardContent className="p-3 text-center space-y-1">
              <div className="text-xs text-default-500">{s.accountName}</div>
              <div className={`text-lg font-bold ${s.balance >= 0 ? 'text-success-600' : 'text-danger-600'}`}>
                {Number(Math.abs(s.balance)).toLocaleString('fa-IR')}
              </div>
              <div className="text-xs text-default-400">ریال · {Number(s.txCount).toLocaleString('fa-IR')} تراکنش</div>
            </CardContent>
          </Card>
        ))}
        {/* جمع کل */}
        <Card className="border-2 border-default-300 bg-default-50">
          <CardContent className="p-3 text-center space-y-1">
            <div className="text-xs text-default-500">جمع کل</div>
            <div className={`text-lg font-bold ${totalBalance >= 0 ? 'text-success-600' : 'text-danger-600'}`}>
              {Number(Math.abs(totalBalance)).toLocaleString('fa-IR')}
            </div>
            <div className="text-xs text-default-400">ریال</div>
          </CardContent>
        </Card>
      </div>

      {/* فیلترها */}
      <Card>
        <CardContent className="flex flex-wrap gap-2 items-end">
          <Select
            label="حساب"
            selectedKeys={[filterAccount]}
            onSelectionChange={(k) => setFilterAccount(String(Array.from(k)[0] || 'all') as CashAccountType | 'all')}
            className="w-36"
            size="sm"
          >
            {ACCOUNT_TYPES.map((a) => (
              <SelectItem key={a.value}>{a.label}</SelectItem>
            ))}
          </Select>
          <ShamsiDatePicker
            label="از تاریخ"
            value={filterFrom}
            onChange={setFilterFrom}
            size="sm"
            className="w-36"
          />
          <ShamsiDatePicker
            label="تا تاریخ"
            value={filterTo}
            onChange={setFilterTo}
            size="sm"
            className="w-36"
          />
          <Button size="sm" variant="flat" onPress={() => void reload()}>اعمال</Button>
          <Button size="sm" variant="light" onPress={() => { setFilterAccount('all'); setFilterFrom(''); setFilterTo(todayIso()); }}>
            پاک کردن
          </Button>
        </CardContent>
      </Card>

      {/* لیست تراکنش‌ها */}
      <Card>
        <CardContent className="gap-2">
          <div className="flex justify-between items-center mb-1">
            <h3 className="font-semibold text-sm">تراکنش‌ها ({Number(transactions.length).toLocaleString('fa-IR')})</h3>
            {filterAccount !== 'all' && (
              <div className="text-sm font-medium">
                مانده {summary.find((s) => s.accountType === filterAccount)?.accountName}:
                <span className="font-bold text-primary mr-1">
                  {Number(summary.find((s) => s.accountType === filterAccount)?.balance ?? 0).toLocaleString('fa-IR')} ریال
                </span>
              </div>
            )}
          </div>

          {loading && <p className="text-center text-sm text-default-400 py-6 animate-pulse">در حال بارگذاری...</p>}
          {!loading && transactions.length === 0 && (
            <p className="text-center text-sm text-default-500 py-8">هنوز تراکنشی ثبت نشده است.</p>
          )}

          {!loading && transactions.map((tx) => (
            <div key={tx.id} className="bg-default-50 border border-default-200 rounded-lg p-3 text-sm">
              <div className="flex justify-between items-start gap-2">
                <div className="space-y-0.5 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="bg-default-200 text-default-700 text-xs px-1.5 py-0.5 rounded">
                      {accountTypeLabel(tx.accountType)}
                    </span>
                    <span className="text-xs text-default-500">
                      {TRANSACTION_TYPE_LABELS[tx.transactionType] || tx.transactionType}
                    </span>
                  </div>
                  {tx.orderNumber && (
                    <div className="text-xs text-default-500">فاکتور: {tx.orderNumber}</div>
                  )}
                  {tx.customerPhone && (
                    <div className="text-xs text-default-500">مشتری: {tx.customerPhone}</div>
                  )}
                  {tx.referenceCode && (
                    <div className="text-xs text-default-400">کد پیگیری: {tx.referenceCode}</div>
                  )}
                  {tx.description && (
                    <div className="text-xs text-default-600">{tx.description}</div>
                  )}
                </div>
                <div className="flex flex-col items-end gap-1 shrink-0">
                  <div className={`font-bold text-base ${tx.amount >= 0 ? 'text-success-600' : 'text-danger-600'}`}>
                    {formatAmount(tx.amount)} ریال
                  </div>
                  <div className="text-xs text-default-400">{toShamsiDate(tx.date)}</div>
                  <div className="text-xs text-default-300">{toShamsiTime(tx.createdAt)}</div>
                </div>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* مودال ثبت دستی */}
      <Modal isOpen={manualOpen} onOpenChange={setManualOpen}>
        <ModalShell size="sm">
          <ModalHeader>ثبت تراکنش دستی</ModalHeader>
          <ModalBody className="gap-4">
            <Select
              label="حساب"
              selectedKeys={[manualAccountType]}
              onSelectionChange={(k) => setManualAccountType(String(Array.from(k)[0] || 'cash') as CashAccountType)}
              isRequired
            >
              <SelectItem key="cash">صندوق</SelectItem>
              <SelectItem key="card">کارتخوان</SelectItem>
              <SelectItem key="online">آنلاین</SelectItem>
              <SelectItem key="bank">بانک</SelectItem>
            </Select>
            <Select
              label="نوع تراکنش"
              selectedKeys={[manualType]}
              onSelectionChange={(k) => setManualType(String(Array.from(k)[0] || 'manual_in') as 'manual_in' | 'manual_out')}
              isRequired
            >
              <SelectItem key="manual_in">ورودی (دریافت وجه)</SelectItem>
              <SelectItem key="manual_out">خروجی (پرداخت وجه)</SelectItem>
            </Select>
            <Input
              type="number"
              label="مبلغ (ریال)"
              value={manualAmount}
              onValueChange={setManualAmount}
              min={1}
              isRequired
            />
            <Input
              label="شرح (اختیاری)"
              value={manualDesc}
              onValueChange={setManualDesc}
              placeholder="توضیح…"
            />
          </ModalBody>
          <ModalFooter>
            <Button variant="flat" onPress={() => setManualOpen(false)}>انصراف</Button>
            <Button
              color="primary"
              isLoading={manualSaving}
              isDisabled={!manualAmount || Number(manualAmount) <= 0}
              onPress={() => void handleManualSave()}
            >
              ثبت
            </Button>
          </ModalFooter>
        </ModalShell>
      </Modal>
    </div>
  );
}
