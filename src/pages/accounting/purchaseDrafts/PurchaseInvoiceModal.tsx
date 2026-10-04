import type {
  Dispatch,
  KeyboardEvent as ReactKeyboardEvent,
  RefObject,
  SetStateAction,
} from 'react';
import { ModalBody, ModalFooter, ModalHeader } from '@heroui/react';
import { Modal } from '@/ui/compat-modal';
import { Button } from '../../../ui/compat-button';
import { Input } from '../../../ui/compat-input';
import { ModalShell } from '../../../ui/modal-shell';
import { ShamsiDatePicker } from '../../../ui/ShamsiDatePicker';
import { ItemPicker } from '../../../ui/ItemPicker';
import {
  emptyItem,
  formatCurrency,
  formatPriceInput,
  normalizePriceInput,
  type DraftItem,
} from './shared';

type PickerOption = { id: string; label: string };

export interface PurchaseInvoiceModalProps {
  open: boolean;
  setOpen: (open: boolean) => void;
  isViewMode: boolean;
  editingId: number | null;
  isEditingApprovedInvoice: boolean;
  items: DraftItem[];
  setItems: Dispatch<SetStateAction<DraftItem[]>>;
  runningTotal: number;
  barcodeRef: RefObject<HTMLInputElement | null>;
  scanValue: string;
  setScanValue: (v: string) => void;
  handleScanKeyDown: (e: ReactKeyboardEvent<HTMLInputElement>) => void;
  invoiceNumber: string;
  setInvoiceNumber: (v: string) => void;
  suppliers: any[];
  supplierId: string;
  setSupplierId: (v: string) => void;
  purchaseDate: string;
  setPurchaseDate: (v: string) => void;
  hasNoProducts: boolean;
  flashIdx: number | null;
  menuProductOptions: PickerOption[];
  materialOptions: PickerOption[];
  accountingFinalProducts: any[];
  menuProducts: any[];
  materials: any[];
  updateItem: (idx: number, patch: Partial<DraftItem>) => void;
  qtyRefs: RefObject<Record<number, HTMLInputElement | null>>;
  handleQtyKeyDown: (e: ReactKeyboardEvent<HTMLInputElement>) => void;
  extraCosts: string;
  setExtraCosts: (v: string) => void;
  isSaving: boolean;
  hasValidItems: boolean;
  handleSave: () => void | Promise<void>;
}

export function PurchaseInvoiceModal({
  open,
  setOpen,
  isViewMode,
  editingId,
  isEditingApprovedInvoice,
  items,
  setItems,
  runningTotal,
  barcodeRef,
  scanValue,
  setScanValue,
  handleScanKeyDown,
  invoiceNumber,
  setInvoiceNumber,
  suppliers,
  supplierId,
  setSupplierId,
  purchaseDate,
  setPurchaseDate,
  hasNoProducts,
  flashIdx,
  menuProductOptions,
  materialOptions,
  accountingFinalProducts,
  menuProducts,
  materials,
  updateItem,
  qtyRefs,
  handleQtyKeyDown,
  extraCosts,
  setExtraCosts,
  isSaving,
  hasValidItems,
  handleSave,
}: PurchaseInvoiceModalProps) {
  return (
    <Modal isOpen={open} onOpenChange={setOpen}>
      <ModalShell size="full">
        {/* ── Header ─────────────────────────────────────────────── */}
        <ModalHeader>
          <div className="flex items-center gap-3 w-full">
            <div
              className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                isViewMode ? 'bg-default-soft' : editingId ? 'bg-warning-soft' : 'bg-accent-soft'
              }`}
            >
              {isViewMode ? (
                <svg
                  className="w-5 h-5 text-muted"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                  />
                </svg>
              ) : editingId ? (
                <svg
                  className="w-5 h-5 text-warning"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
                  />
                </svg>
              ) : (
                <svg
                  className="w-5 h-5 text-accent"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 4v16m8-8H4"
                  />
                </svg>
              )}
            </div>
            <div className="min-w-0">
              <p className="font-semibold text-foreground leading-tight">
                {isViewMode
                  ? 'مشاهده فاکتور خرید'
                  : isEditingApprovedInvoice
                    ? 'ویرایش فاکتور تاییدشده'
                    : editingId
                      ? 'ویرایش پیش‌نویس'
                      : 'ثبت پیش‌نویس خرید'}
              </p>
              {(items.length > 0 || runningTotal > 0) && (
                <p className="text-xs text-muted mt-0.5">
                  {items.length} قلم
                  {runningTotal > 0 && (
                    <>
                      {' '}
                      ·{' '}
                      <span className="text-accent font-medium">
                        {formatCurrency(runningTotal)}
                      </span>
                    </>
                  )}
                </p>
              )}
            </div>
          </div>
        </ModalHeader>

        <ModalBody className="gap-0 p-0">
          <div className="flex flex-col gap-4 p-4 sm:p-5">
            {isEditingApprovedInvoice && (
              <div className="rounded-xl border border-warning/40 bg-warning-soft p-3 text-sm text-warning-soft-foreground">
                ذخیره تغییرات این فاکتور را دستکاری نمی‌کند: به‌صورت خودکار یک برگشت کامل از این
                خرید ثبت و یک فاکتور خرید جدید با مقادیر ویرایش‌شده صادر می‌شود. اگر برای این فاکتور
                از قبل پرداختی ثبت شده باشد، سرور این عملیات را رد می‌کند — در آن صورت از «برگشت از
                خرید» دستی استفاده کنید.
              </div>
            )}

            {/* ── Barcode scanner ─────────────────────────────────── */}
            {!isViewMode && (
              <div className="relative rounded-2xl border-2 border-accent/30 bg-gradient-to-l from-accent-soft/80 to-accent-soft/40 p-3 sm:p-4">
                <div className="flex items-center gap-2 mb-2.5">
                  <span className="relative flex h-2.5 w-2.5">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-accent opacity-60" />
                    <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-accent" />
                  </span>
                  <span className="text-xs font-semibold text-accent-soft-foreground">
                    اسکنر بارکد آماده است
                  </span>
                  <span className="mr-auto text-xs text-accent/80 hidden sm:inline">
                    Enter = افزودن
                  </span>
                </div>
                <Input
                  ref={barcodeRef}
                  autoFocus
                  value={scanValue}
                  onValueChange={setScanValue}
                  onKeyDown={handleScanKeyDown}
                  placeholder="بارکد کالا را اسکن یا تایپ کنید..."
                  startContent={
                    <svg
                      className="w-5 h-5 text-accent/80 shrink-0"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M4 5v14M8 5v14M12 5v14M16 5v10M20 5v14"
                      />
                    </svg>
                  }
                />
              </div>
            )}

            {/* ── Invoice info ─────────────────────────────────────── */}
            <div className="rounded-2xl border border-border bg-default-soft/60 p-4">
              <p className="text-xs font-semibold text-muted uppercase tracking-wide mb-3">
                اطلاعات فاکتور
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <Input
                  label="شماره فاکتور"
                  value={invoiceNumber}
                  onValueChange={setInvoiceNumber}
                  isRequired
                  isReadOnly={isViewMode}
                  startContent={<span className="text-muted text-sm">#</span>}
                />
                {isViewMode ? (
                  <Input
                    label="تامین‌کننده"
                    value={
                      suppliers.find((s) => String(s.id) === supplierId)?.name || supplierId || '—'
                    }
                    isReadOnly
                  />
                ) : (
                  <ItemPicker
                    options={suppliers.map((s) => ({ id: String(s.id), label: s.name }))}
                    value={supplierId || null}
                    label="تامین‌کننده"
                    placeholder="انتخاب تامین‌کننده..."
                    onChange={setSupplierId}
                  />
                )}
                <ShamsiDatePicker
                  label="تاریخ فاکتور"
                  value={purchaseDate}
                  onChange={isViewMode ? () => {} : setPurchaseDate}
                  isRequired
                  isReadOnly={isViewMode}
                />
              </div>
            </div>

            {/* ── Items ────────────────────────────────────────────── */}
            <div>
              <div className="flex items-center justify-between mb-2.5">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-foreground">اقلام خرید</span>
                  {items.length > 0 && (
                    <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-accent text-accent-foreground text-[10px] font-bold">
                      {items.length}
                    </span>
                  )}
                </div>
                {!isViewMode && (
                  <button
                    type="button"
                    onMouseDown={(e) => {
                      e.preventDefault();
                      setItems((prev) => [...prev, emptyItem()]);
                    }}
                    className="inline-flex items-center gap-1 text-xs font-medium text-accent hover:text-accent cursor-pointer transition-colors duration-150"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2.5}
                        d="M12 4v16m8-8H4"
                      />
                    </svg>
                    افزودن قلم
                  </button>
                )}
              </div>

              {/* Warning: no products synced */}
              {hasNoProducts && (
                <div className="rounded-xl border border-warning/30 bg-warning-soft p-3 flex gap-2.5">
                  <svg
                    className="w-5 h-5 text-warning shrink-0 mt-0.5"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                    />
                  </svg>
                  <div>
                    <p className="text-warning-soft-foreground text-sm font-medium">
                      هیچ کالایی یافت نشد
                    </p>
                    <p className="text-warning text-xs mt-0.5">
                      محصولات را با سرور همگام‌سازی کنید یا از بارکد استفاده کنید
                    </p>
                  </div>
                </div>
              )}

              {/* Empty state */}
              {items.length === 0 && !hasNoProducts && !isViewMode && (
                <button
                  type="button"
                  onMouseDown={(e) => {
                    e.preventDefault();
                    setItems((prev) => [...prev, emptyItem()]);
                  }}
                  className="w-full rounded-2xl border-2 border-dashed border-border hover:border-accent/40 hover:bg-accent-soft/30 bg-default-soft py-8 px-4 text-center cursor-pointer transition-all duration-200 group"
                >
                  <svg
                    className="w-8 h-8 mx-auto text-muted group-hover:text-accent/40 mb-2 transition-colors duration-200"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={1.5}
                      d="M4 5v14M8 5v14M12 5v14M16 5v10M20 5v14"
                    />
                  </svg>
                  <p className="text-muted text-sm font-medium">
                    بارکد اسکن کنید یا اینجا کلیک کنید
                  </p>
                  <p className="text-muted text-xs mt-0.5">برای افزودن اولین قلم</p>
                </button>
              )}

              {items.length === 0 && isViewMode && (
                <p className="text-muted text-sm text-center py-6">این فاکتور قلمی ندارد</p>
              )}

              {/* Item rows */}
              <div className="space-y-2.5">
                {items.map((line, idx) => {
                  const isFinalProduct = line.type === 'final_product';
                  const lineTotal = Number(normalizePriceInput(line.totalPrice) || 0);
                  const lineQty = Number(line.quantity || 0);
                  const unitPriceForLine = lineQty > 0 ? lineTotal / lineQty : 0;
                  const activeOptions = isFinalProduct ? menuProductOptions : materialOptions;
                  const selectedKey = isFinalProduct ? line.menuProductId : line.rawMaterialId;

                  const viewLabel = isFinalProduct
                    ? accountingFinalProducts.find((fp) => String(fp.id) === line.finalProductId)
                        ?.name ||
                      menuProducts.find((p) => String(p.id) === selectedKey)?.name_fa ||
                      menuProducts.find((p) => String(p.id) === selectedKey)?.name ||
                      '—'
                    : materials.find((m) => String(m.id) === selectedKey)?.name || '—';

                  return (
                    <div
                      key={idx}
                      className={`rounded-2xl border transition-all duration-300 overflow-hidden ${
                        flashIdx === idx
                          ? 'border-accent/50 shadow-[0_0_0_3px_theme(colors.primary.DEFAULT/0.12)]'
                          : 'border-border hover:border-border-secondary'
                      }`}
                    >
                      {/* Item header row */}
                      <div
                        className={`flex items-center gap-2 px-3 py-2 ${
                          flashIdx === idx ? 'bg-accent-soft' : 'bg-default-soft/80'
                        }`}
                      >
                        {/* Index badge */}
                        <span className="w-5 h-5 rounded-full bg-default text-muted text-[10px] font-bold flex items-center justify-center shrink-0">
                          {idx + 1}
                        </span>

                        {/* Type toggle — pill-in-track (iOS style) */}
                        {!isViewMode && (
                          <div className="flex rounded-full bg-default p-0.5 gap-0.5 shrink-0">
                            <button
                              type="button"
                              className={`flex items-center gap-1 px-3 py-1 rounded-full text-[11px] font-semibold transition-all duration-200 cursor-pointer ${
                                !isFinalProduct
                                  ? 'bg-white text-orange-600 shadow-sm'
                                  : 'text-muted hover:text-foreground/80'
                              }`}
                              onMouseDown={(e) => {
                                e.preventDefault();
                                if (isFinalProduct)
                                  updateItem(idx, {
                                    type: 'raw_material',
                                    menuProductId: '',
                                    finalProductId: '',
                                  });
                              }}
                            >
                              <span
                                className={`w-1.5 h-1.5 rounded-full shrink-0 ${!isFinalProduct ? 'bg-orange-400' : 'bg-default-hover'}`}
                              />
                              ماده اولیه
                            </button>
                            <button
                              type="button"
                              className={`flex items-center gap-1 px-3 py-1 rounded-full text-[11px] font-semibold transition-all duration-200 cursor-pointer ${
                                isFinalProduct
                                  ? 'bg-white text-accent shadow-sm'
                                  : 'text-muted hover:text-foreground/80'
                              }`}
                              onMouseDown={(e) => {
                                e.preventDefault();
                                if (!isFinalProduct)
                                  updateItem(idx, { type: 'final_product', rawMaterialId: '' });
                              }}
                            >
                              <span
                                className={`w-1.5 h-1.5 rounded-full shrink-0 ${isFinalProduct ? 'bg-accent' : 'bg-default-hover'}`}
                              />
                              محصول
                            </button>
                          </div>
                        )}
                        {isViewMode && (
                          <span
                            className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold ${
                              isFinalProduct
                                ? 'bg-accent-soft text-accent-soft-foreground'
                                : 'bg-orange-100 text-orange-700'
                            }`}
                          >
                            <span
                              className={`w-1.5 h-1.5 rounded-full ${isFinalProduct ? 'bg-accent' : 'bg-orange-400'}`}
                            />
                            {isFinalProduct ? 'محصول رستوران' : 'ماده اولیه'}
                          </span>
                        )}

                        {/* Line total — pushed to end */}
                        <div className="mr-auto flex items-center gap-2">
                          {lineTotal > 0 && (
                            <span className="text-xs font-semibold text-foreground tabular-nums">
                              {formatCurrency(lineTotal)}
                            </span>
                          )}
                          {/* Delete */}
                          {!isViewMode && (
                            <button
                              type="button"
                              onMouseDown={(e) => {
                                e.preventDefault();
                                setItems((prev) => prev.filter((_, i) => i !== idx));
                              }}
                              className="w-6 h-6 rounded-lg flex items-center justify-center text-muted hover:text-danger hover:bg-danger-soft transition-colors duration-150 cursor-pointer"
                              aria-label="حذف آیتم"
                            >
                              <svg
                                className="w-3.5 h-3.5"
                                fill="none"
                                stroke="currentColor"
                                viewBox="0 0 24 24"
                              >
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  strokeWidth={2}
                                  d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                                />
                              </svg>
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Item body */}
                      <div className="p-3 space-y-2.5 bg-background">
                        {/* Product / material selector */}
                        {isViewMode ? (
                          <div className="flex items-center gap-2 py-1">
                            <span className="text-xs text-muted">
                              {isFinalProduct ? 'محصول:' : 'ماده اولیه:'}
                            </span>
                            <span className="text-sm font-medium text-foreground">{viewLabel}</span>
                          </div>
                        ) : activeOptions.length === 0 ? (
                          <p className="text-xs text-muted py-1">
                            {isFinalProduct ? 'هیچ محصولی یافت نشد' : 'هیچ ماده اولیه‌ای ثبت نشده'}
                          </p>
                        ) : (
                          <ItemPicker
                            options={activeOptions}
                            value={selectedKey || null}
                            label={isFinalProduct ? 'محصول رستوران' : 'ماده اولیه'}
                            placeholder={`جستجو در ${isFinalProduct ? 'محصولات' : 'مواد اولیه'}...`}
                            onChange={(val) => {
                              if (isFinalProduct) {
                                const prod = menuProducts.find((p) => String(p.id) === val);
                                const autoSalePrice =
                                  prod?.price != null && prod.price > 0 ? String(prod.price) : '';
                                updateItem(idx, {
                                  menuProductId: val,
                                  finalProductId: '',
                                  salePrice: autoSalePrice,
                                });
                              } else {
                                updateItem(idx, { rawMaterialId: val });
                              }
                            }}
                          />
                        )}

                        {/* Qty + prices */}
                        <div className="grid grid-cols-3 gap-2">
                          <Input
                            ref={(el) => {
                              qtyRefs.current[idx] = el;
                            }}
                            type="number"
                            label="تعداد / مقدار"
                            value={line.quantity}
                            onValueChange={(v) => updateItem(idx, { quantity: v })}
                            onKeyDown={handleQtyKeyDown}
                            isReadOnly={isViewMode}
                          />
                          <Input
                            type="text"
                            inputMode="numeric"
                            label="قیمت کل"
                            value={formatPriceInput(line.totalPrice)}
                            onValueChange={(v) =>
                              updateItem(idx, { totalPrice: normalizePriceInput(v) })
                            }
                            endContent={<span className="text-muted text-xs">ریال</span>}
                            isReadOnly={isViewMode}
                          />
                          <Input
                            type="text"
                            inputMode="numeric"
                            label="قیمت فروش"
                            placeholder="اختیاری"
                            value={formatPriceInput(line.salePrice)}
                            onValueChange={(v) =>
                              updateItem(idx, { salePrice: normalizePriceInput(v) })
                            }
                            endContent={<span className="text-muted text-xs">ریال</span>}
                            isReadOnly={isViewMode}
                          />
                        </div>

                        {/* Unit price hint */}
                        {unitPriceForLine > 0 && lineQty > 1 && (
                          <p className="text-[11px] text-muted flex items-center gap-1">
                            <svg
                              className="w-3.5 h-3.5"
                              fill="none"
                              stroke="currentColor"
                              viewBox="0 0 24 24"
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                              />
                            </svg>
                            قیمت واحد: {formatCurrency(unitPriceForLine)}
                          </p>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Add item button — only when items exist */}
              {!isViewMode && items.length > 0 && (
                <button
                  type="button"
                  onMouseDown={(e) => {
                    e.preventDefault();
                    setItems((prev) => [...prev, emptyItem()]);
                  }}
                  className="mt-2.5 w-full rounded-xl border border-dashed border-border hover:border-accent/40 hover:bg-accent-soft/20 py-2 text-xs font-medium text-muted hover:text-accent flex items-center justify-center gap-1.5 transition-all duration-200 cursor-pointer"
                >
                  <svg
                    className="w-3.5 h-3.5"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2.5}
                      d="M12 4v16m8-8H4"
                    />
                  </svg>
                  افزودن قلم جدید
                </button>
              )}
            </div>

            {/* ── Summary ──────────────────────────────────────────── */}
            <div className="rounded-2xl border border-border bg-default-soft/60 p-4">
              <p className="text-xs font-semibold text-muted uppercase tracking-wide mb-3">
                خلاصه فاکتور
              </p>
              <div className="flex items-end gap-3">
                <div className="flex-1">
                  <Input
                    type="text"
                    inputMode="numeric"
                    label="هزینه جانبی"
                    value={formatPriceInput(extraCosts)}
                    onValueChange={(v) => setExtraCosts(normalizePriceInput(v))}
                    endContent={<span className="text-muted text-sm">ریال</span>}
                    isReadOnly={isViewMode}
                  />
                </div>
                <div className="flex-1 rounded-xl bg-gradient-to-l from-accent-soft to-accent-soft border border-accent/20 px-4 py-3 text-left">
                  <p className="text-xs text-accent font-medium mb-0.5">جمع کل فاکتور</p>
                  <p className="font-bold text-accent text-xl tabular-nums">
                    {formatCurrency(runningTotal)}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </ModalBody>

        {/* ── Footer ───────────────────────────────────────────────── */}
        <ModalFooter className="border-t border-border">
          <div className="flex items-center gap-3 w-full">
            {!isViewMode && items.length > 0 && (
              <span className="text-xs text-muted mr-auto">
                {items.length} قلم · {formatCurrency(runningTotal)}
              </span>
            )}
            <div className="flex gap-2 mr-auto">
              <Button variant="flat" color="default" onPress={() => setOpen(false)}>
                {isViewMode ? 'بستن' : 'انصراف'}
              </Button>
              {!isViewMode && (
                <Button
                  color="primary"
                  isLoading={isSaving}
                  isDisabled={!hasValidItems}
                  onPress={handleSave}
                  title={!hasValidItems ? 'حداقل یک قلم با کالا و مقدار وارد کنید' : undefined}
                  startContent={
                    !isSaving && (
                      <svg
                        className="w-4 h-4"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M5 13l4 4L19 7"
                        />
                      </svg>
                    )
                  }
                >
                  {editingId ? 'ذخیره تغییرات' : 'ثبت پیش‌نویس'}
                </Button>
              )}
            </div>
          </div>
        </ModalFooter>
      </ModalShell>
    </Modal>
  );
}
