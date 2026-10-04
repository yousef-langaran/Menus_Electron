import { Card, CardContent } from '@heroui/react';
import { Button } from '../../../ui/compat-button';
import { Input } from '../../../ui/compat-input';
import { Select, SelectItem } from '../../../ui/compat-select';
import { ShamsiDatePicker } from '../../../ui/ShamsiDatePicker';
import { formatPriceInput, normalizePriceInput } from './shared';

export interface PurchaseDraftFiltersProps {
  hasActiveFilters: boolean;
  clearFilters: () => void;
  filterInvoice: string;
  setFilterInvoice: (v: string) => void;
  filterSupplier: string;
  setFilterSupplier: (v: string) => void;
  filterStatus: string;
  setFilterStatus: (v: string) => void;
  filterSyncStatus: string;
  setFilterSyncStatus: (v: string) => void;
  filterDateFrom: string;
  setFilterDateFrom: (v: string) => void;
  filterDateTo: string;
  setFilterDateTo: (v: string) => void;
  filterMinAmount: string;
  setFilterMinAmount: (v: string) => void;
  filterMaxAmount: string;
  setFilterMaxAmount: (v: string) => void;
  suppliers: any[];
  filteredDrafts: any[];
  drafts: any[];
}

export function PurchaseDraftFilters({
  hasActiveFilters,
  clearFilters,
  filterInvoice,
  setFilterInvoice,
  filterSupplier,
  setFilterSupplier,
  filterStatus,
  setFilterStatus,
  filterSyncStatus,
  setFilterSyncStatus,
  filterDateFrom,
  setFilterDateFrom,
  filterDateTo,
  setFilterDateTo,
  filterMinAmount,
  setFilterMinAmount,
  filterMaxAmount,
  setFilterMaxAmount,
  suppliers,
  filteredDrafts,
  drafts,
}: PurchaseDraftFiltersProps) {
  return (
    <Card>
      <CardContent className="py-3 px-4 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <span className="text-sm font-semibold text-foreground">فیلتر</span>
          {hasActiveFilters && (
            <Button size="sm" variant="light" color="danger" onPress={clearFilters}>
              پاک کردن فیلترها
            </Button>
          )}
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
          <Input
            size="sm"
            label="شماره فاکتور"
            placeholder="جستجو..."
            value={filterInvoice}
            onValueChange={setFilterInvoice}
          />
          <Select
            size="sm"
            label="تامین‌کننده"
            selectedKeys={filterSupplier ? [filterSupplier] : []}
            onSelectionChange={(k) => setFilterSupplier(String(Array.from(k)[0] || ''))}
          >
            {suppliers.map((s) => (
              <SelectItem key={String(s.id)}>{s.name}</SelectItem>
            ))}
          </Select>
          <Select
            size="sm"
            label="وضعیت فاکتور"
            selectedKeys={filterStatus ? [filterStatus] : []}
            onSelectionChange={(k) => setFilterStatus(String(Array.from(k)[0] || ''))}
          >
            <SelectItem key="draft">پیش‌نویس</SelectItem>
            <SelectItem key="pending_approval">در انتظار تایید</SelectItem>
            <SelectItem key="approved">تایید شده</SelectItem>
            <SelectItem key="rejected">رد شده</SelectItem>
          </Select>
          <Select
            size="sm"
            label="وضعیت سینک"
            selectedKeys={filterSyncStatus ? [filterSyncStatus] : []}
            onSelectionChange={(k) => setFilterSyncStatus(String(Array.from(k)[0] || ''))}
          >
            <SelectItem key="pending">در صف ارسال</SelectItem>
            <SelectItem key="syncing">در حال ارسال</SelectItem>
            <SelectItem key="synced">سینک شده</SelectItem>
            <SelectItem key="failed">ارسال ناموفق</SelectItem>
          </Select>
          <ShamsiDatePicker
            size="sm"
            label="از تاریخ"
            value={filterDateFrom}
            onChange={setFilterDateFrom}
          />
          <ShamsiDatePicker
            size="sm"
            label="تا تاریخ"
            value={filterDateTo}
            onChange={setFilterDateTo}
          />
          <Input
            size="sm"
            label="حداقل مبلغ"
            placeholder="ریال"
            inputMode="numeric"
            value={formatPriceInput(filterMinAmount)}
            onValueChange={(v) => setFilterMinAmount(normalizePriceInput(v))}
          />
          <Input
            size="sm"
            label="حداکثر مبلغ"
            placeholder="ریال"
            inputMode="numeric"
            value={formatPriceInput(filterMaxAmount)}
            onValueChange={(v) => setFilterMaxAmount(normalizePriceInput(v))}
          />
        </div>
        {hasActiveFilters && (
          <p className="text-xs text-muted">
            {filteredDrafts.length} نتیجه از {drafts.length} فاکتور
          </p>
        )}
      </CardContent>
    </Card>
  );
}
