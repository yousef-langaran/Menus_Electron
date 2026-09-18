import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, Chip, Spinner } from '@heroui/react';
import { Button } from '../../ui/compat-button';
import { ItemPicker } from '../../ui/ItemPicker';
import { useAuthStore } from '../../store/authStore';
import { accountingDb } from '../../services/accountingLocalDb';
import { getInventoryKardex, type KardexReport } from '../../services/api';
import { toShamsiDateTime } from '../../utils/date';
import { toast } from '../../utils/toast';

type ItemType = 'final_product' | 'raw_material';

const MOVEMENT_LABELS: Record<string, string> = {
  purchase: 'خرید',
  sale: 'فروش',
  adjustment: 'اصلاح موجودی',
  return: 'برگشت',
  transfer: 'انتقال انبار',
  initial: 'موجودی ابتدایی',
};

const formatQty = (n: number) =>
  new Intl.NumberFormat('fa-IR', { maximumFractionDigits: 3 }).format(n);

const formatCurrency = (n: number | null) =>
  n == null ? '—' : new Intl.NumberFormat('fa-IR').format(Math.round(n)) + ' ریال';

export default function KardexReportPage() {
  const navigate = useNavigate();
  const { user, token } = useAuthStore((s) => ({ user: s.user, token: s.token }));
  const restaurantId = user?.restaurants?.[0]?.id;

  const [itemType, setItemType] = useState<ItemType>('final_product');
  const [itemId, setItemId] = useState<string | null>(null);
  const [materials, setMaterials] = useState<any[]>([]);
  const [finalProducts, setFinalProducts] = useState<any[]>([]);
  const [report, setReport] = useState<KardexReport | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);

  useEffect(() => {
    if (!restaurantId) return;
    (async () => {
      const [m, fp] = await Promise.all([
        accountingDb.rawMaterials.where('restaurantId').equals(restaurantId).toArray(),
        accountingDb.finalProducts.where('restaurantId').equals(restaurantId).toArray(),
      ]);
      setMaterials(m);
      setFinalProducts(fp);
    })();
  }, [restaurantId]);

  const options = useMemo(() => {
    const list = itemType === 'final_product' ? finalProducts : materials;
    return list.map((x) => ({ id: String(x.id), label: x.name }));
  }, [itemType, finalProducts, materials]);

  const loadReport = useCallback(async () => {
    if (!restaurantId || !itemId || !token) return;
    setIsLoading(true);
    setHasSearched(true);
    try {
      const data = await getInventoryKardex(
        {
          restaurantId,
          ...(itemType === 'final_product' ? { finalProductId: Number(itemId) } : { rawMaterialId: Number(itemId) }),
        },
        token,
      );
      setReport(data);
    } catch {
      toast.error('خطا در دریافت گزارش کاردکس. لطفاً دوباره تلاش کنید.');
      setReport(null);
    } finally {
      setIsLoading(false);
    }
  }, [restaurantId, itemId, itemType, token]);

  return (
    <div className="min-h-screen bg-background p-4 space-y-4" dir="rtl">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-xl font-bold text-foreground">گزارش کاردکس کالا</h1>
        <Button variant="flat" size="sm" onPress={() => navigate('/accounting')}>بازگشت</Button>
      </div>

      <Card>
        <CardContent className="py-4 px-4 space-y-3">
          <p className="text-xs text-muted">
            تاریخچهٔ کامل ورود/خروج یک کالا — برای کالای نهایی، قیمت خرید و قیمت فروشِ ثبت‌شده در هر فاکتور خرید هم نشان داده می‌شود تا مشخص شود کدام فاکتور باعث تغییر (یا صفر شدن) قیمت فروش شده است.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="flex rounded-full bg-default p-0.5 gap-0.5 self-start sm:col-span-1">
              <button
                type="button"
                className={`flex-1 px-3 py-1.5 rounded-full text-xs font-semibold transition-all duration-200 cursor-pointer ${
                  itemType === 'final_product' ? 'bg-white text-accent shadow-sm' : 'text-muted hover:text-foreground/80'
                }`}
                onClick={() => { setItemType('final_product'); setItemId(null); setReport(null); setHasSearched(false); }}
              >
                کالای نهایی
              </button>
              <button
                type="button"
                className={`flex-1 px-3 py-1.5 rounded-full text-xs font-semibold transition-all duration-200 cursor-pointer ${
                  itemType === 'raw_material' ? 'bg-white text-orange-600 shadow-sm' : 'text-muted hover:text-foreground/80'
                }`}
                onClick={() => { setItemType('raw_material'); setItemId(null); setReport(null); setHasSearched(false); }}
              >
                ماده اولیه
              </button>
            </div>
            <div className="sm:col-span-2">
              <ItemPicker
                options={options}
                value={itemId}
                label={itemType === 'final_product' ? 'کالای نهایی' : 'ماده اولیه'}
                placeholder="جستجو..."
                onChange={(v) => { setItemId(v); setReport(null); setHasSearched(false); }}
              />
            </div>
          </div>
          <Button color="primary" size="sm" isDisabled={!itemId} isLoading={isLoading} onPress={loadReport}>
            نمایش کاردکس
          </Button>
        </CardContent>
      </Card>

      {isLoading && (
        <div className="flex items-center justify-center py-12">
          <Spinner />
        </div>
      )}

      {!isLoading && hasSearched && report && (
        <Card>
          <CardContent className="py-4 px-4 space-y-3">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div>
                <p className="font-semibold text-foreground">{report.item.name}</p>
                <p className="text-xs text-muted">
                  موجودی فعلی: {formatQty(report.item.currentStock)} {report.item.unit || ''}
                </p>
              </div>
              <Chip size="sm" variant="flat" color="default">{report.rows.length} رویداد</Chip>
            </div>

            {report.rows.length === 0 ? (
              <p className="text-muted text-sm text-center py-8">برای این کالا هنوز رویدادی ثبت نشده است</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border text-muted">
                      <th className="text-right py-2 px-2 font-medium">تاریخ</th>
                      <th className="text-right py-2 px-2 font-medium">رویداد</th>
                      <th className="text-center py-2 px-2 font-medium">مقدار</th>
                      <th className="text-center py-2 px-2 font-medium">موجودی بعد</th>
                      <th className="text-right py-2 px-2 font-medium">مرجع</th>
                      {itemType === 'final_product' && (
                        <>
                          <th className="text-center py-2 px-2 font-medium">قیمت خرید</th>
                          <th className="text-center py-2 px-2 font-medium">قیمت فروش</th>
                        </>
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {report.rows.map((row) => {
                      const zeroSalePriceWarning =
                        itemType === 'final_product' &&
                        row.referenceType === 'purchase_invoice' &&
                        row.salePrice === 0;
                      return (
                        <tr
                          key={row.id}
                          className={`border-b border-border ${zeroSalePriceWarning ? 'bg-danger-soft' : ''}`}
                        >
                          <td className="py-2 px-2 text-muted whitespace-nowrap">{toShamsiDateTime(row.date)}</td>
                          <td className="py-2 px-2">
                            <span className={`inline-flex items-center gap-1 ${row.isIncrease ? 'text-success' : 'text-danger'}`}>
                              {row.isIncrease ? '▲' : '▼'} {MOVEMENT_LABELS[row.movementType] || row.movementType}
                            </span>
                          </td>
                          <td className="py-2 px-2 text-center tabular-nums">
                            {row.isIncrease ? '+' : '-'}{formatQty(row.quantity)}
                          </td>
                          <td className="py-2 px-2 text-center tabular-nums font-medium">{formatQty(row.balanceAfter)}</td>
                          <td className="py-2 px-2 text-muted">{row.invoiceNumber || '—'}</td>
                          {itemType === 'final_product' && (
                            <>
                              <td className="py-2 px-2 text-center tabular-nums">{formatCurrency(row.unitPrice)}</td>
                              <td className={`py-2 px-2 text-center tabular-nums ${zeroSalePriceWarning ? 'text-danger font-bold' : ''}`}>
                                {row.salePrice == null ? '—' : formatCurrency(row.salePrice)}
                              </td>
                            </>
                          )}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
