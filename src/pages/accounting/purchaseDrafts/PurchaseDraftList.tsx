import type { NavigateFunction } from 'react-router-dom';
import { Card, CardContent } from '@heroui/react';
import { Chip } from '@/ui/compat-chip';
import { Button } from '../../../ui/compat-button';
import { accountingDb, deletePurchaseInvoiceDraftLocal } from '../../../services/accountingLocalDb';
import { updateAccountingPurchaseInvoiceStatus } from '../../../services/api';
import { toast } from '../../../utils/toast';
import { INVOICE_STATUS_CONFIG, SYNC_STATUS_CONFIG, formatCurrency, toJalali } from './shared';

export interface PurchaseDraftListProps {
  isLoading: boolean;
  drafts: any[];
  filteredDrafts: any[];
  pagedDrafts: any[];
  suppliers: any[];
  token: string | null;
  restaurantId: number | undefined;
  navigate: NavigateFunction;
  reload: () => Promise<void>;
  openCreate: () => void;
  clearFilters: () => void;
  loadInvoiceIntoModal: (d: any, viewOnly: boolean) => Promise<void>;
  openApprovedEdit: (d: any, serverInvoiceId: number) => Promise<void>;
  page: number;
  setPage: (updater: number | ((p: number) => number)) => void;
  totalPages: number;
}

export function PurchaseDraftList({
  isLoading,
  drafts,
  filteredDrafts,
  pagedDrafts,
  suppliers,
  token,
  restaurantId,
  navigate,
  reload,
  openCreate,
  clearFilters,
  loadInvoiceIntoModal,
  openApprovedEdit,
  page,
  setPage,
  totalPages,
}: PurchaseDraftListProps) {
  return isLoading ? (
    <div className="flex flex-col gap-3">
      {[1, 2, 3].map((i) => (
        <div key={i} className="rounded-xl bg-default h-20 animate-pulse" />
      ))}
    </div>
  ) : drafts.length === 0 ? (
    <Card>
      <CardContent className="flex flex-col items-center justify-center py-16 gap-3">
        <div className="w-14 h-14 rounded-full bg-default flex items-center justify-center">
          <svg className="w-7 h-7 text-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
            />
          </svg>
        </div>
        <p className="text-muted text-sm">هیچ پیش‌نویس خریدی ثبت نشده است</p>
        <Button color="primary" onPress={openCreate}>
          ثبت اولین پیش‌نویس
        </Button>
      </CardContent>
    </Card>
  ) : filteredDrafts.length === 0 ? (
    <Card>
      <CardContent className="flex flex-col items-center justify-center py-12 gap-3">
        <p className="text-muted text-sm">هیچ فاکتوری با این فیلترها یافت نشد</p>
        <Button size="sm" variant="flat" onPress={clearFilters}>
          پاک کردن فیلترها
        </Button>
      </CardContent>
    </Card>
  ) : (
    <div className="flex flex-col gap-3">
      {pagedDrafts.map((d) => {
        const syncCfg = SYNC_STATUS_CONFIG[d.localSyncStatus] ?? SYNC_STATUS_CONFIG.pending;
        const invCfg = INVOICE_STATUS_CONFIG[d.status] ?? INVOICE_STATUS_CONFIG.pending_approval;
        const isServerSynced = d.localSyncStatus === 'synced';
        const canApproveReject = isServerSynced && d.status === 'pending_approval' && token;
        const serverInvoiceId = d.serverInvoiceId ?? (isServerSynced ? d.id : null);
        const supplierName =
          d.supplierName || suppliers.find((s) => s.id === d.supplierId)?.name || '—';
        return (
          <Card
            key={d.id}
            className="transition-shadow duration-200 hover:shadow-md cursor-default"
          >
            <CardContent className="py-3 px-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex flex-col gap-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-foreground">فاکتور #{d.invoiceNumber}</span>
                    <Chip color={invCfg.color as any} size="sm" variant="soft">
                      <Chip.Label>{invCfg.label}</Chip.Label>
                    </Chip>
                    {!isServerSynced && (
                      <Chip color={syncCfg.color} size="sm" variant="flat">
                        <Chip.Label>{syncCfg.label}</Chip.Label>
                      </Chip>
                    )}
                  </div>
                  <div className="flex items-center gap-3 text-xs text-muted flex-wrap">
                    <span>{supplierName}</span>
                    {d.purchaseDate && <span>{toJalali(d.purchaseDate)}</span>}
                    {d.totalAmount > 0 && (
                      <span className="text-foreground font-medium">
                        {formatCurrency(d.totalAmount)}
                      </span>
                    )}
                  </div>
                  {d.syncError && (
                    <p className="text-danger text-xs mt-0.5 break-words whitespace-pre-wrap">
                      {Array.isArray(d.syncError) ? d.syncError.join('؛ ') : String(d.syncError)}
                    </p>
                  )}
                </div>
                <div className="flex gap-1 shrink-0 flex-wrap">
                  {isServerSynced && d.status === 'approved' && (
                    <Button
                      size="sm"
                      color="warning"
                      variant="flat"
                      onPress={() =>
                        navigate('/accounting/purchase-returns', {
                          state: { invoiceId: serverInvoiceId ?? d.id },
                        })
                      }
                    >
                      برگشت از خرید
                    </Button>
                  )}
                  {canApproveReject && serverInvoiceId && (
                    <>
                      <Button
                        size="sm"
                        color="success"
                        variant="flat"
                        onPress={async () => {
                          if (!restaurantId) return;
                          try {
                            await updateAccountingPurchaseInvoiceStatus(
                              Number(serverInvoiceId),
                              { restaurantId, status: 'approved' },
                              token!,
                            );
                            await accountingDb.purchaseInvoices.update(d.id, {
                              status: 'approved',
                            });
                            await reload();
                            toast.success('فاکتور تایید شد');
                          } catch {
                            toast.error('خطا در تایید فاکتور');
                          }
                        }}
                      >
                        تایید
                      </Button>
                      <Button
                        size="sm"
                        color="danger"
                        variant="flat"
                        onPress={async () => {
                          if (!restaurantId) return;
                          try {
                            await updateAccountingPurchaseInvoiceStatus(
                              Number(serverInvoiceId),
                              { restaurantId, status: 'rejected' },
                              token!,
                            );
                            await accountingDb.purchaseInvoices.update(d.id, {
                              status: 'rejected',
                            });
                            await reload();
                            toast.success('فاکتور رد شد');
                          } catch {
                            toast.error('خطا در رد فاکتور');
                          }
                        }}
                      >
                        رد
                      </Button>
                    </>
                  )}
                  {(d.status === 'pending_approval' || d.status === 'draft') && (
                    <Button size="sm" variant="flat" onPress={() => loadInvoiceIntoModal(d, false)}>
                      ویرایش
                    </Button>
                  )}
                  {d.status === 'approved' && isServerSynced && token && serverInvoiceId ? (
                    <Button
                      size="sm"
                      variant="flat"
                      onPress={() => openApprovedEdit(d, Number(serverInvoiceId))}
                    >
                      ویرایش
                    </Button>
                  ) : (
                    (d.status === 'approved' || d.status === 'rejected') && (
                      <Button
                        size="sm"
                        variant="flat"
                        onPress={() => loadInvoiceIntoModal(d, true)}
                      >
                        مشاهده
                      </Button>
                    )
                  )}
                  {!isServerSynced && (
                    <Button
                      size="sm"
                      color="danger"
                      variant="light"
                      onPress={async () => {
                        await deletePurchaseInvoiceDraftLocal(d.id);
                        await reload();
                        toast.success('پیش‌نویس حذف شد');
                      }}
                    >
                      حذف
                    </Button>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        );
      })}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between gap-2 pt-1">
          <span className="text-xs text-muted">
            صفحه {page} از {totalPages} — {filteredDrafts.length} فاکتور
          </span>
          <div className="flex items-center gap-1">
            <Button
              size="sm"
              variant="flat"
              isDisabled={page === 1}
              onPress={() => setPage((p) => Math.max(1, p - 1))}
            >
              قبلی
            </Button>
            {Array.from({ length: totalPages }, (_, i) => i + 1)
              .filter((p) => p === 1 || p === totalPages || Math.abs(p - page) <= 1)
              .reduce<(number | '…')[]>((acc, p, idx, arr) => {
                if (
                  idx > 0 &&
                  typeof arr[idx - 1] === 'number' &&
                  (p as number) - (arr[idx - 1] as number) > 1
                )
                  acc.push('…');
                acc.push(p);
                return acc;
              }, [])
              .map((p, i) =>
                p === '…' ? (
                  <span key={`ellipsis-${i}`} className="px-1 text-muted text-sm">
                    …
                  </span>
                ) : (
                  <Button
                    key={p}
                    size="sm"
                    variant={p === page ? 'solid' : 'flat'}
                    color={p === page ? 'primary' : 'default'}
                    onPress={() => setPage(p as number)}
                  >
                    {p}
                  </Button>
                ),
              )}
            <Button
              size="sm"
              variant="flat"
              isDisabled={page === totalPages}
              onPress={() => setPage((p) => Math.min(totalPages, p + 1))}
            >
              بعدی
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
