import { useRef, useState } from 'react';
import { Button } from '../../../ui/compat-button';
import { Input } from '../../../ui/compat-input';
import { Textarea } from '../../../ui/compat-textarea';
import { useOrderStore } from '../../../store/orderStore';

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
}

export function OrderCart({ cartItemOptions, formatPrice, onCheckout, isDisabled, editingOrderId }: Props) {
  const {
    sessions, activeSessionId, addSession, removeSession, switchSession,
    cart, addToCart: _addToCart, updateCartQuantity, updateCartItemOption, removeFromCart,
    getTotalAmount,
  } = useOrderStore();

  const [expandedNoteProductId, setExpandedNoteProductId] = useState<number | null>(null);
  const notePanelRef = useRef<HTMLDivElement | null>(null);
  const openNoteSectionRef = useRef<HTMLDivElement | null>(null);

  const getAssetBaseUrl = () => {
    // inline to avoid circular import — same as api.ts helper
    return (window as any).__assetBaseUrl__ || 'https://api.hoshmenu.ir';
  };

  const isInteractive = (e: React.MouseEvent) =>
    (e.target as HTMLElement).closest('button, input, textarea, select');

  return (
    <div className="flex flex-col gap-2 overflow-hidden min-h-0 h-[calc(100vh_-120px)]">
      <div className="flex-1 overflow-hidden min-h-0 rounded-xl border border-default-200 bg-content1">
        <div className="overflow-y-auto h-full p-2 sm:p-3">
          {/* Session tabs */}
          <div className="flex items-center gap-1 mb-2 flex-wrap">
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
                        ? 'bg-primary text-primary-foreground shadow-sm'
                        : 'bg-default-100 text-default-600 hover:bg-default-200',
                    ].join(' ')}
                  >
                    {session.label}
                    {itemCount > 0 && (
                      <span className={[
                        'inline-flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-bold',
                        isActive ? 'bg-white/30 text-primary-foreground' : 'bg-primary text-white',
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
                className="flex items-center gap-0.5 rounded-md px-2 py-1 text-xs text-default-500 hover:bg-default-100 hover:text-default-800 transition-colors"
                title="سبد خرید جدید">
                <span className="text-base leading-none">+</span>
                <span>سبد جدید</span>
              </button>
            )}
          </div>

          <h2 className="text-sm font-semibold text-foreground mb-2">سبد خرید</h2>

          {cart.length === 0 ? (
            <p className="text-default-500 text-sm py-4 text-center">سبد خرید خالی است</p>
          ) : (
            <div className="flex flex-col gap-1.5">
              {cart.map((item) => {
                const noteValue = String(item.itemOption ?? '');
                const isNoteOpen = expandedNoteProductId === item.productId;
                const notePreview = noteValue.trim();
                const appendOption = (opt: string) => {
                  const current = String(item.itemOption ?? '').trim();
                  updateCartItemOption(item.productId, current + (current ? '، ' : '') + opt);
                };
                return (
                  <div
                    key={item.productId}
                    className="flex flex-col gap-2 rounded-lg border border-default-200 bg-content1 p-2"
                    onClick={(e) => { if (isInteractive(e)) return; updateCartQuantity(item.productId, item.quantity + 1); }}
                    onContextMenu={(e) => { e.preventDefault(); if (isInteractive(e)) return; updateCartQuantity(item.productId, item.quantity - 1); }}
                    onAuxClick={(e) => { if (e.button !== 1) return; if (isInteractive(e)) return; removeFromCart(item.productId); }}
                  >
                    <div className="flex w-full items-start gap-2">
                      {item.product.multiMedia?.url ? (
                        <div className="h-9 w-9 shrink-0 overflow-hidden rounded-md">
                          <img src={`${getAssetBaseUrl()}${item.product.multiMedia.url}`} alt="" className="h-full w-full object-cover" />
                        </div>
                      ) : null}
                      <div className="min-w-0 flex-1">
                        <span className="block text-right text-sm font-medium leading-relaxed text-foreground break-words">
                          {item.product.name_fa || item.product.name}
                        </span>
                        {notePreview ? (
                          <p className="mt-1 text-right text-xs leading-relaxed text-default-600 break-words whitespace-pre-wrap">{notePreview}</p>
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
                            <span className="text-xs text-default-400 leading-none">{item.product.unit}</span>
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
                          className={`h-6 min-h-6 w-6 min-w-6 shrink-0 ${notePreview || isNoteOpen ? 'text-primary' : 'text-default-400'}`}
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
                        <div ref={notePanelRef} className="w-full rounded-md border border-default-200 bg-default-100 p-1.5 space-y-1.5">
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
              <div className="sticky bottom-0 z-[1] -mx-2 mt-3 border-t border-default-200 bg-content1/95 px-2 pt-3 pb-0.5 backdrop-blur-sm sm:-mx-3 sm:px-3">
                <div className="flex items-center justify-between gap-3 rounded-lg border border-default-200 bg-default-100 px-3 py-2.5 shadow-sm">
                  <span className="text-sm font-medium text-default-600">جمع کل</span>
                  <span className="text-base font-bold tabular-nums tracking-tight text-foreground">
                    {formatPrice(getTotalAmount())}
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      <Button
        color="primary" size="md" className="w-full font-semibold min-h-10"
        onPress={onCheckout}
        isDisabled={isDisabled || cart.length === 0}
      >
        {editingOrderId != null ? 'ذخیرهٔ فاکتور' : 'ثبت سفارش'}
      </Button>
    </div>
  );
}
