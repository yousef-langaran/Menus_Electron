import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronRight, ChevronLeft } from 'lucide-react';
import { Button } from '../../../ui/compat-button';
import { Input } from '../../../ui/compat-input';
import { Textarea } from '../../../ui/compat-textarea';
import { useOrderStore, type CartItem } from '../../../store/orderStore';
import { useAuthStore } from '../../../store/authStore';
import { useOrderNavStore } from '../../../store/orderNavStore';
import { useCatalogDisplayStore } from '../../../store/catalogDisplayStore';
import { getAssetBaseUrl, cancelPointsReward } from '../../../services/api';
import { isValidIranMobile, normalizeIranMobile } from '../../../utils/iranMobile';
import { toast } from '../../../utils/toast';

function CartItemNoteIcon({ className }: { className?: string }) {
  return (
    <svg className={className} xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
    </svg>
  );
}

interface Props {
  cartItemOptions: string[];
  formatPrice: (price: number) => string;
  onCheckout: () => void;
  isDisabled?: boolean;
  editingOrderId: number | null;
  /** برای نمایش داخل مودال تکمیل سفارش — تب‌های چند-سبدی و دکمهٔ ثبت داخلی را مخفی می‌کند (مودال خودش دکمهٔ ثبت دارد) */
  embedded?: boolean;
}

export function OrderCart({ cartItemOptions, formatPrice, onCheckout, isDisabled, editingOrderId, embedded }: Props) {
  const {
    sessions, activeSessionId, addSession, removeSession, switchSession,
    cart, customerPhone, addToCart: _addToCart, updateCartQuantity, updateCartItemOption, removeFromCart,
    getTotalAmount,
  } = useOrderStore();
  const { user, token } = useAuthStore();
  const navigate = useNavigate();
  const orderIds = useOrderNavStore((s) => s.orderIds);
  const showProductImages = useCatalogDisplayStore((s) => s.showProductImages);

  /** پیمایش بین فاکتور قبلی/بعدی — ایندکس‌گذاری دقیقاً مثل میانبر ← / → در pages/order/index.tsx
      تا این دو مسیر همیشه هم‌خوان بمانند. برخلاف میانبر کیبورد (که برای جلوگیری از فشار اشتباه
      وقتی سبد پر است کاملاً غیرفعال می‌شود)، این دکمه‌ها کلیک عمدی صندوق‌دار هستند — پس به‌جای
      غیرفعال‌کردن کامل، فقط قبل از رفتن با سبد پر تأیید می‌گیرند (همان الگوی resetSession) */
  const currentOrderIndex = editingOrderId != null ? orderIds.indexOf(editingOrderId) : -1;
  const goToOrder = (direction: 'prev' | 'next') => {
    if (orderIds.length === 0) return;
    const max = orderIds.length - 1;
    const nextIndex = direction === 'next' ? Math.min(currentOrderIndex + 1, max) : Math.max(currentOrderIndex - 1, 0);
    if (currentOrderIndex !== -1 && nextIndex === currentOrderIndex) return;
    if (editingOrderId == null && cart.length > 0 && !window.confirm('سبد خرید فعلی ذخیره نشده — رفتن به فاکتور دیگر آن را پاک می‌کند. ادامه می‌دهید؟')) return;
    navigate(`/order?edit=${orderIds[nextIndex]}`);
  };
  const canGoPrev = orderIds.length > 0 && currentOrderIndex !== 0;
  const canGoNext = orderIds.length > 0 && currentOrderIndex !== orderIds.length - 1;

  const [expandedNoteProductId, setExpandedNoteProductId] = useState<number | null>(null);
  const [cancellingFreeLineKey, setCancellingFreeLineKey] = useState<string | null>(null);
  const notePanelRef = useRef<HTMLDivElement | null>(null);
  const openNoteSectionRef = useRef<HTMLDivElement | null>(null);

  const isInteractive = (e: React.MouseEvent) =>
    (e.target as HTMLElement).closest('button, input, textarea, select');

  /**
   * حذف یک خطِ «رایگان (جایزه)» از سبد باید امتیازِ کسرشده‌اش را هم برگرداند —
   * وگرنه صندوق‌دار با یک کلیک اشتباه، امتیاز مشتری را برای همیشه از دست
   * می‌دهد بدون این‌که آیتمی هم تحویل داده باشد. اول لغو در بک‌اند (که یک
   * ردیف مثبت جبرانی در دفتر کل امتیاز ثبت می‌کند)، بعد حذف از سبد — اگر لغو
   * fail شود، از سبد هم حذف نمی‌کنیم تا این خط گم نشود و صندوق‌دار بتواند
   * دوباره تلاش کند.
   */
  const handleRemoveFreeLine = async (item: CartItem, rowKey: string) => {
    const redemptionIds = item.freeRedemptionIds ?? [];
    const restaurantId = user?.restaurants?.[0]?.id ? Number(user.restaurants[0].id) : undefined;
    const normalized = normalizeIranMobile(customerPhone.trim());
    if (redemptionIds.length > 0 && restaurantId && isValidIranMobile(normalized)) {
      setCancellingFreeLineKey(rowKey);
      try {
        await Promise.all(
          redemptionIds.map((redemptionId) =>
            cancelPointsReward({ restaurantId, phone: normalized, redemptionId }, token ?? undefined),
          ),
        );
        toast.success('امتیاز این جایزه به مشتری بازگردانده شد');
      } catch (err: any) {
        toast.error(err?.response?.data?.message ?? 'خطا در بازگرداندن امتیاز — دوباره تلاش کنید');
        setCancellingFreeLineKey(null);
        return;
      }
      setCancellingFreeLineKey(null);
    }
    removeFromCart(item.productId, item.freeRewardTierId);
  };

  return (
    <div className={`flex flex-col gap-2 overflow-hidden min-h-0 ${embedded ? 'h-full' : 'h-[calc(100vh_-120px)]'}`}>
      <div className="flex-1 overflow-hidden min-h-0 rounded-xl border border-border bg-surface">
        <div className="overflow-y-auto h-full p-2 sm:p-3">
          {/* Session tabs — hidden in edit mode و داخل مودال (سوییچ سبد وسط چک‌اوت گمراه‌کننده است) */}
          {editingOrderId == null && !embedded && <div className="flex items-center gap-1 mb-2 flex-wrap">
            {sessions.map((session) => {
              const isActive = session.id === activeSessionId;
              const itemCount = session.cart.reduce((n, i) => n + i.quantity, 0);
              return (
                <div key={session.id} className="relative group flex items-center">
                  <button
                    type="button"
                    onClick={() => switchSession(session.id)}
                    className={[
                      'flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-medium transition-colors',
                      isActive
                        ? 'bg-accent text-accent-foreground shadow-sm'
                        : 'bg-default-soft text-foreground/70 hover:bg-default',
                    ].join(' ')}
                  >
                    {session.label}
                    {itemCount > 0 && (
                      <span className={[
                        'inline-flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-bold',
                        isActive ? 'bg-white/30 text-accent-foreground' : 'bg-accent text-white',
                      ].join(' ')}>
                        {itemCount}
                      </span>
                    )}
                  </button>
                  {sessions.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeSession(session.id)}
                      className="absolute -top-1.5 -right-1.5 hidden group-hover:flex h-4 w-4 items-center justify-center rounded-full bg-danger text-white text-[10px] leading-none shadow"
                      title="بستن سبد"
                    >×</button>
                  )}
                </div>
              );
            })}
            {sessions.length < 3 && (
              <button type="button" onClick={addSession}
                className="flex items-center gap-0.5 rounded-md px-2 py-1 text-xs text-muted hover:bg-default-soft hover:text-foreground/90 transition-colors"
                title="سبد خرید جدید">
                <span className="text-base leading-none">+</span>
                <span>سبد جدید</span>
              </button>
            )}
          </div>}

          <div className="flex items-center justify-between mb-2">
            <h2 className="text-sm font-semibold text-foreground">سبد خرید</h2>
            {!embedded && (
              <div className="flex items-center gap-0.5">
                <Button
                  size="sm" isIconOnly variant="flat"
                  className="h-5 min-h-5 w-5 min-w-5 text-muted"
                  isDisabled={!canGoPrev}
                  onPress={() => goToOrder('prev')}
                  aria-label="سفارش قبلی"
                >
                  <ChevronRight className="h-3 w-3" aria-hidden />
                </Button>
                <Button
                  size="sm" isIconOnly variant="flat"
                  className="h-5 min-h-5 w-5 min-w-5 text-muted"
                  isDisabled={!canGoNext}
                  onPress={() => goToOrder('next')}
                  aria-label="سفارش بعدی"
                >
                  <ChevronLeft className="h-3 w-3" aria-hidden />
                </Button>
              </div>
            )}
          </div>

          {cart.length === 0 ? (
            <p className="text-muted text-sm py-4 text-center">سبد خرید خالی است</p>
          ) : (
            <div className="flex flex-col gap-1.5">
              {cart.map((item) => {
                const isFree = item.freeRewardTierId != null;
                const rowKey = `${item.productId}:${item.freeRewardTierId ?? 'paid'}`;
                const noteValue = String(item.itemOption ?? '');
                const isNoteOpen = expandedNoteProductId === item.productId && !isFree;
                const notePreview = isFree ? '' : noteValue.trim();
                const appendOption = (opt: string) => {
                  const current = String(item.itemOption ?? '').trim();
                  updateCartItemOption(item.productId, current + (current ? '، ' : '') + opt);
                };
                if (isFree) {
                  return (
                    <div key={rowKey} className="flex items-center justify-between gap-2 rounded-lg border border-success/30 bg-success-soft p-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="shrink-0 rounded-full bg-success-soft px-2 py-0.5 text-[10px] font-bold text-success-soft-foreground">رایگان (جایزه)</span>
                        <span className="truncate text-sm font-medium text-foreground">
                          {item.quantity > 1 ? `${item.quantity}× ` : ''}{item.product.name_fa || item.product.name}
                        </span>
                      </div>
                      <div className="flex shrink-0 items-center gap-1">
                        <span className="text-xs font-semibold tabular-nums text-success-soft-foreground">{formatPrice(0)}</span>
                        <Button size="sm" color="danger" variant="light" isIconOnly className="h-7 min-h-7 w-7 min-w-7 text-sm"
                          isLoading={cancellingFreeLineKey === rowKey}
                          isDisabled={cancellingFreeLineKey != null && cancellingFreeLineKey !== rowKey}
                          onPress={() => handleRemoveFreeLine(item, rowKey)}>
                          ×
                        </Button>
                      </div>
                    </div>
                  );
                }
                return (
                  <div
                    key={rowKey}
                    className="flex flex-col gap-2 rounded-lg border border-border bg-surface p-2"
                    onClick={(e) => { if (isInteractive(e)) return; updateCartQuantity(item.productId, item.quantity + 1); }}
                    onContextMenu={(e) => { e.preventDefault(); if (isInteractive(e)) return; updateCartQuantity(item.productId, item.quantity - 1); }}
                    onAuxClick={(e) => { if (e.button !== 1) return; if (isInteractive(e)) return; removeFromCart(item.productId); }}
                  >
                    <div className="flex w-full items-start gap-2">
                      {showProductImages && item.product.multiMedia?.url ? (
                        <div className="h-9 w-9 shrink-0 overflow-hidden rounded-md">
                          <img src={`${getAssetBaseUrl()}${item.product.multiMedia.url}`} alt="" className="h-full w-full object-cover" />
                        </div>
                      ) : null}
                      <div className="min-w-0 flex-1">
                        <span className="block text-right text-sm font-medium leading-relaxed text-foreground break-words">
                          {item.product.name_fa || item.product.name}
                        </span>
                        {notePreview ? (
                          <p className="mt-1 text-right text-xs leading-relaxed text-foreground/70 break-words whitespace-pre-wrap">{notePreview}</p>
                        ) : null}
                      </div>
                    </div>

                    <div ref={isNoteOpen ? openNoteSectionRef : undefined} className="flex w-full min-w-0 flex-col gap-1.5">
                      <div className="flex w-full min-w-0 flex-wrap items-center justify-between gap-2">
                        <div className="flex shrink-0 items-center gap-0.5">
                          <Button size="sm" isIconOnly variant="flat" className="h-7 min-h-7 w-7 min-w-7 text-sm"
                            onPress={() => { if (item.quantity <= 1) removeFromCart(item.productId); else updateCartQuantity(item.productId, item.quantity - 1); }}>
                            −
                          </Button>
                          {item.product?.unit && item.product.unit !== 'عدد' && (
                            <span className="text-xs text-muted leading-none">{item.product.unit}</span>
                          )}
                          <Input
                            type="number" min={0.1} step={0.1} size="sm"
                            className="h-7 min-h-7 w-full max-w-[4.25rem] py-0 text-center text-xs"
                            value={String(item.quantity)}
                            onValueChange={(v) => {
                              const val = parseFloat(String(v).replace(',', '.'));
                              if (!Number.isNaN(val)) {
                                if (val <= 0) removeFromCart(item.productId);
                                else updateCartQuantity(item.productId, val);
                              }
                            }}
                            onBlur={(e) => {
                              const raw = (e.target as HTMLInputElement).value.replace(',', '.');
                              const v = parseFloat(raw);
                              if (raw === '' || Number.isNaN(v) || v <= 0) updateCartQuantity(item.productId, 1);
                            }}
                            onClick={(e) => e.stopPropagation()}
                          />
                          <Button size="sm" isIconOnly variant="flat" className="h-7 min-h-7 w-7 min-w-7 text-sm"
                            onPress={() => updateCartQuantity(item.productId, item.quantity + 1)}>
                            +
                          </Button>
                        </div>

                        <Button
                          size="sm" isIconOnly variant="flat"
                          className={`h-6 min-h-6 w-6 min-w-6 shrink-0 ${notePreview || isNoteOpen ? 'text-accent' : 'text-muted'}`}
                          onPress={() => setExpandedNoteProductId((id) => (id === item.productId ? null : item.productId))}
                          title={notePreview ? 'ویرایش توضیحات' : 'توضیحات'}
                          aria-label={notePreview ? 'ویرایش توضیحات' : 'افزودن توضیحات'}
                        >
                          <CartItemNoteIcon className="h-3.5 w-3.5" />
                        </Button>

                        <div className="flex shrink-0 items-center gap-1">
                          <span className="text-xs font-semibold tabular-nums text-foreground">
                            {formatPrice(item.totalPrice)}
                          </span>
                          <Button size="sm" color="danger" variant="light" isIconOnly className="h-7 min-h-7 w-7 min-w-7 text-sm"
                            onPress={() => removeFromCart(item.productId)}>
                            ×
                          </Button>
                        </div>
                      </div>

                      {isNoteOpen && (
                        <div ref={notePanelRef} className="w-full rounded-md border border-border bg-default-soft p-1.5 space-y-1.5">
                          {cartItemOptions.length > 0 && (
                            <div className="flex flex-wrap gap-0.5">
                              {cartItemOptions.map((opt) => (
                                <Button key={opt} size="sm" variant="bordered" className="h-7 min-h-7 px-2 text-xs"
                                  onPress={() => appendOption(opt)}>
                                  + {opt}
                                </Button>
                              ))}
                            </div>
                          )}
                          <Textarea
                            value={noteValue}
                            onValueChange={(v) => updateCartItemOption(item.productId, v)}
                            onBlur={(e) => {
                              const next = e.relatedTarget;
                              if (next != null && notePanelRef.current?.contains(next as Node)) return;
                              setExpandedNoteProductId(null);
                            }}
                            placeholder="توضیح دستی (اختیاری)"
                            minRows={2} size="sm"
                            classNames={{ input: 'min-h-[4rem] text-right text-xs' }}
                          />
                          <Button size="sm" variant="flat" className="h-7 min-h-7 text-xs"
                            onPress={() => setExpandedNoteProductId(null)}>
                            بستن
                          </Button>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}

              {/* Total */}
              <div className="sticky bottom-0 z-[1] -mx-2 mt-3 border-t border-border bg-surface/95 px-2 pt-3 pb-0.5 backdrop-blur-sm sm:-mx-3 sm:px-3">
                <div className="flex items-center justify-between gap-3 rounded-lg border border-border bg-default-soft px-3 py-2.5 shadow-sm">
                  <span className="text-sm font-medium text-foreground/70">جمع کل</span>
                  <span className="text-base font-bold tabular-nums tracking-tight text-foreground">
                    {formatPrice(getTotalAmount())}
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {!embedded && (
        <Button
          color="primary" size="md" className="w-full font-semibold min-h-10"
          onPress={onCheckout}
          isDisabled={isDisabled || cart.length === 0}
        >
          {editingOrderId != null ? 'ذخیرهٔ فاکتور' : 'ثبت سفارش'}
        </Button>
      )}
    </div>
  );
}
