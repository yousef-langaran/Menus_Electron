import { useState, useEffect, useRef } from 'react';
import { useAuthStore } from '../store/authStore';
import { useOrderStore } from '../store/orderStore';
import { getProducts, getRestaurantByName, getRestaurantById, checkUser } from '../services/api';
import { getCachedMenu, cacheMenu } from '../services/cache';
import { useNavigate } from 'react-router-dom';
import { usePrinterSettingsStore } from '../store/printerSettingsStore';
import './Order.css';

export default function OrderPage() {
  const { user, token, logout } = useAuthStore();
  const navigate = useNavigate();
  const {
    cart,
    customerPhone,
    serviceType,
    tableNumber,
    customerAddress,
    paymentMethod,
    notes,
    discountAmount,
    discountType,
    isSubmitting,
    addToCart,
    updateCartQuantity,
    updateCartItemOption,
    removeFromCart,
    setCustomerPhone,
    setServiceType,
    setTableNumber,
    setCustomerAddress,
    setPaymentMethod,
    setNotes,
    setDiscountAmount,
    setDiscountType,
    submitOrder,
    clearCart,
    getTotalAmount,
    getFinalAmount,
    getDiscountAmount,
  } = useOrderStore();

  const [products, setProducts] = useState<any[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string>('');
  const [cartItemOptions, setCartItemOptions] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [userExists, setUserExists] = useState<boolean | null>(null);
  const [isCheckingUser, setIsCheckingUser] = useState(false);
  /** آیتمی که پنل توضیحاتش باز است (برای جمع‌وجور بودن صفحه) */
  const [expandedNoteProductId, setExpandedNoteProductId] = useState<number | null>(null);
  const enabledPrinters = usePrinterSettingsStore((state) =>
    Object.values(state.configs).filter((config) => config.enabled)
  );
  const phoneInputRef = useRef<HTMLInputElement>(null);
  /** ref پنل توضیحات باز — برای تشخیص کلیک داخل پنل در onBlur */
  const notePanelRef = useRef<HTMLDivElement | null>(null);
  /** نمایش پاپ‌آپ تکمیل سفارش (تخفیف + اطلاعات مشتری) */
  const [showOrderModal, setShowOrderModal] = useState(false);

  useEffect(() => {
    loadProducts();
  }, []);

  const loadProducts = async () => {
    setIsLoading(true);
    setError('');

    try {
      // Try to get cached menu first
      const restaurantName = user?.restaurants?.[0]?.name;
      const restaurantId = user?.restaurants?.[0]?.id;
      
      let productsData: any[] = [];
      const cached = await getCachedMenu(restaurantId, restaurantName);
      
      if (cached) {
        productsData = cached.products;
        setProducts(productsData);
        setCategories(cached.categories);
        setCartItemOptions(Array.isArray(cached.cartItemOptions) ? cached.cartItemOptions : []);
        setIsLoading(false);
      }

      // Try to fetch from server if online
      const isOnline = window.electronAPI 
        ? await window.electronAPI.checkOnline() 
        : navigator.onLine;

      if (isOnline && token) {
        try {
          productsData = await getProducts(restaurantName, restaurantId, token);
          setProducts(productsData);

          let options: string[] = [];
          try {
            const restaurant = restaurantId
              ? await getRestaurantById(Number(restaurantId), token)
              : await getRestaurantByName(restaurantName || '', token);
            const raw = restaurant?.cartItemOptions;
            options = Array.isArray(raw) ? raw.filter((s: any) => s != null && String(s).trim()) : [];
            setCartItemOptions(options);
          } catch (_) {
            setCartItemOptions((prev) => prev);
          }

          const uniqueCategories = Array.from(
            new Set(productsData.map(p => p.category?.name_fa).filter(Boolean))
          );
          setCategories(uniqueCategories as string[]);

          // Cache the menu (including cart item options for offline)
          await cacheMenu(restaurantId || 0, restaurantName || '', productsData, uniqueCategories as string[], options);
        } catch (err) {
          console.warn('Failed to fetch products from server:', err);
          if (productsData.length === 0) {
            setError('خطا در بارگذاری منو. از حالت آفلاین استفاده می‌شود.');
          }
        }
      } else if (productsData.length === 0) {
        setError('شما در حالت آفلاین هستید و منو در حافظه ذخیره نشده است.');
      }
    } catch (err: any) {
      setError(err.message || 'خطا در بارگذاری منو');
    } finally {
      setIsLoading(false);
    }
  };

  const handleCheckUser = async () => {
    if (!customerPhone.trim()) return;
    
    setIsCheckingUser(true);
    try {
      const isOnline = window.electronAPI 
        ? await window.electronAPI.checkOnline() 
        : navigator.onLine;

      if (isOnline) {
        const response = await checkUser(customerPhone.trim());
        setUserExists(response.userExists || false);
      } else {
        setUserExists(null);
      }
    } catch (err) {
      console.error('Error checking user:', err);
      setUserExists(null);
    } finally {
      setIsCheckingUser(false);
    }
  };

  const handleSubmit = async () => {
    setError('');

    const result = await submitOrder();
    
    if (result.success) {
      setShowOrderModal(false);
      // Print receipt if printers are selected
      if (enabledPrinters.length > 0 && window.electronAPI && result.orderId) {
        try {
          const orderData = {
            id: result.orderId,
            orderNumber: `ORD-${result.orderId}`,
            customerPhone,
            customerName: customerPhone,
            serviceType,
            tableNumber,
            customerAddress,
            paymentMethod,
            notes,
            items: cart.map(item => ({
              product: item.product,
              productName: item.product.name_fa || item.product.name,
              quantity: item.quantity,
              price: item.price,
              itemOption: item.itemOption || undefined,
            })),
            totalAmount: getTotalAmount(),
            discountAmount,
            finalAmount: getFinalAmount(),
          };

          const printerJobs = enabledPrinters.map((printer) => ({
            name: printer.name,
            displayName: printer.displayName,
            paperWidth: printer.paperWidth,
            paperLength: printer.paperLength,
            margin: printer.margin,
            copies: printer.copies,
          }));
          await window.electronAPI.printReceipt(orderData, printerJobs);
        } catch (error) {
          console.error('Print error:', error);
        }
      }

      clearCart();
      setError('');
      setSuccessMessage('سفارش با موفقیت ثبت شد' + (result.offline ? ' (آفلاین)' : ''));
      // بدون استفاده از alert تا فوکوس و ورودی‌ها در الکترون قفل نشوند
      setTimeout(() => {
        phoneInputRef.current?.focus();
      }, 50);
      setTimeout(() => setSuccessMessage(''), 4000);
    } else {
      setError(result.error || 'خطا در ثبت سفارش');
    }
  };

  const filteredProducts = selectedCategory
    ? products.filter(p => p.category?.name_fa === selectedCategory)
    : products;

  const formatPrice = (price: number) => {
    return new Intl.NumberFormat('fa-IR').format(price) + ' تومان';
  };

  return (
    <div className="order-page">
      <header className="order-header">
        <h1>ثبت سفارش</h1>
        <div className="header-actions">
          <button onClick={() => navigate('/orders')} className="secondary-button">
            سفارشات
          </button>
          <button onClick={() => navigate('/settings')} className="settings-button">
            تنظیمات
          </button>
          <button onClick={logout} className="logout-button">
            خروج
          </button>
        </div>
      </header>

      {error && <div className="error-banner">{error}</div>}
      {successMessage && (
        <div className="success-banner" role="alert">
          {successMessage}
        </div>
      )}

      <div className="order-content">
        <div className="products-section">
          <div className="products-main">
            {isLoading ? (
              <div className="loading">در حال بارگذاری...</div>
            ) : (
              <div className="products-grid">
                {filteredProducts.map(product => (
                  <div
                    key={product.id}
                    className="product-card"
                    onClick={() => {
                      setSuccessMessage('');
                      addToCart(product);
                    }}
                  >
                    {product.multiMedia?.url && (
                      <img
                        src={`https://apimenu.promal.ir${product.multiMedia.url}`}
                        alt={product.name_fa || product.name}
                        className="product-image"
                      />
                    )}
                    <div className="product-info">
                      <h3>{product.name_fa || product.name}</h3>
                      <p className="product-price">{formatPrice(product.price)}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
          <aside className="categories-sidebar">
            <div className="categories-sidebar-title">دسته‌بندی‌ها</div>
            <button
              type="button"
              className={`category-chip ${selectedCategory === '' ? 'active' : ''}`}
              onClick={() => setSelectedCategory('')}
            >
              همه
            </button>
            {categories.map(cat => (
              <button
                key={cat}
                type="button"
                className={`category-chip ${selectedCategory === cat ? 'active' : ''}`}
                onClick={() => setSelectedCategory(cat)}
              >
                {cat}
              </button>
            ))}
          </aside>
        </div>

        <div className="order-form-section">
          <div className="cart-section">
            <h2>سبد خرید</h2>
            {cart.length === 0 ? (
              <p className="empty-cart">سبد خرید خالی است</p>
            ) : (
              <div className="cart-items">
                {cart.map(item => {
                  const noteValue = item.itemOption || '';
                  const isNoteOpen = expandedNoteProductId === item.productId;
                  const appendOption = (opt: string) => {
                    const current = (item.itemOption || '').trim();
                    const sep = current ? '، ' : '';
                    updateCartItemOption(item.productId, current + sep + opt);
                  };
                  const notePreview = noteValue.trim();
                  const notePreviewShort = notePreview.length > 28 ? notePreview.slice(0, 28) + '…' : notePreview;
                  const isInteractive = (e: React.MouseEvent) =>
                    (e.target as HTMLElement).closest('button, input, textarea, select');
                  return (
                    <div
                      key={item.productId}
                      className="cart-item"
                      onClick={(e) => {
                        if (isInteractive(e)) return;
                        updateCartQuantity(item.productId, item.quantity + 1);
                      }}
                      onContextMenu={(e) => {
                        e.preventDefault();
                        if (isInteractive(e)) return;
                        updateCartQuantity(item.productId, item.quantity - 1);
                      }}
                      onAuxClick={(e) => {
                        if (e.button !== 1) return;
                        if (isInteractive(e)) return;
                        removeFromCart(item.productId);
                      }}
                    >
                      <div className="cart-item-info">
                        <span>{item.product.name_fa || item.product.name}</span>
                        <div className="cart-item-controls">
                          <button onClick={() => updateCartQuantity(item.productId, Math.max(0.1, item.quantity - 1))}>
                            -
                          </button>
                          <input
                            type="number"
                            min={0.1}
                            step="0.1"
                            className="cart-item-qty-input"
                            value={item.quantity}
                            onChange={(e) => {
                              const raw = e.target.value;
                              if (raw === '') return;
                              const v = parseFloat(raw.replace(',', '.'));
                              if (!Number.isNaN(v)) {
                                if (v <= 0) removeFromCart(item.productId);
                                else updateCartQuantity(item.productId, v);
                              }
                            }}
                            onBlur={(e) => {
                              const raw = (e.target as HTMLInputElement).value.replace(',', '.');
                              const v = parseFloat(raw);
                              if (raw === '' || Number.isNaN(v) || v <= 0) updateCartQuantity(item.productId, 1);
                            }}
                            onClick={(e) => e.stopPropagation()}
                          />
                          <button onClick={() => updateCartQuantity(item.productId, item.quantity + 1)}>
                            +
                          </button>
                        </div>
                        <button
                          type="button"
                          className={`cart-item-note-trigger ${notePreview ? 'has-note' : ''}`}
                          onClick={() => setExpandedNoteProductId((id) => (id === item.productId ? null : item.productId))}
                          title={notePreview || 'افزودن توضیحات'}
                        >
                          {notePreview ? notePreviewShort : 'توضیحات'}
                        </button>
                      </div>
                      {isNoteOpen && (
                        <div
                          ref={notePanelRef}
                          className="cart-item-note"
                        >
                          {cartItemOptions.length > 0 && (
                            <div className="cart-item-option-chips">
                              {cartItemOptions.map(opt => (
                                <button
                                  key={opt}
                                  type="button"
                                  className="cart-item-option-chip"
                                  onClick={() => appendOption(opt)}
                                  title={`افزودن: ${opt}`}
                                >
                                  + {opt}
                                </button>
                              ))}
                            </div>
                          )}
                          <textarea
                            value={noteValue}
                            onChange={(e) => updateCartItemOption(item.productId, e.target.value)}
                            onBlur={(e) => {
                              const next = e.relatedTarget;
                              if (next != null && notePanelRef.current?.contains(next as Node)) return;
                              setExpandedNoteProductId(null);
                            }}
                            placeholder="توضیح دستی (اختیاری)"
                            rows={2}
                            className="cart-item-note-textarea"
                            autoFocus
                          />
                          <button
                            type="button"
                            className="cart-item-note-close"
                            onClick={() => setExpandedNoteProductId(null)}
                          >
                            بستن
                          </button>
                        </div>
                      )}
                      <div className="cart-item-price">
                        {formatPrice(item.totalPrice)}
                        <button
                          onClick={() => removeFromCart(item.productId)}
                          className="remove-button"
                        >
                          ×
                        </button>
                      </div>
                    </div>
                  );
                })}
                <div className="cart-totals">
                  <div className="total-row">
                    <span>جمع کل:</span>
                    <span>{formatPrice(getTotalAmount())}</span>
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className="customer-section customer-section--compact">
            <button
              type="button"
              onClick={() => setShowOrderModal(true)}
              disabled={cart.length === 0}
              className="submit-order-button"
            >
              ثبت سفارش
            </button>
          </div>

          {showOrderModal && (
            <div className="order-modal-overlay" onClick={() => !isSubmitting && setShowOrderModal(false)}>
              <div className="order-modal" onClick={(e) => e.stopPropagation()}>
                <h2 className="order-modal-title">تکمیل و ثبت سفارش</h2>

                <div className="form-group form-group--required">
                  <label>شماره تماس <span className="required-mark">(اجباری)</span></label>
                  <div className="input-with-button">
                    <input
                      ref={phoneInputRef}
                      type="text"
                      value={customerPhone}
                      onChange={(e) => {
                        setCustomerPhone(e.target.value);
                        setUserExists(null);
                        setSuccessMessage('');
                      }}
                      placeholder="09123456789"
                      autoComplete="tel"
                    />
                    <button type="button" onClick={handleCheckUser} disabled={isCheckingUser || !customerPhone.trim()}>
                      {isCheckingUser ? '...' : '✓'}
                    </button>
                  </div>
                  {userExists === true && <span className="user-status success">مشتری ثبت‌نام شده</span>}
                  {userExists === false && <span className="user-status warning">مشتری جدید</span>}
                </div>

                <div className="form-group">
                  <label>نوع سفارش</label>
                  <select
                    value={serviceType}
                    onChange={(e) => {
                      setServiceType(e.target.value as 'dine_in' | 'takeaway');
                      setTableNumber('');
                      setCustomerAddress('');
                    }}
                  >
                    <option value="dine_in">داخل سالن</option>
                    <option value="takeaway">بیرون‌بر</option>
                  </select>
                </div>

                {serviceType === 'dine_in' ? (
                  <div className="form-group">
                    <label>شماره میز (اختیاری)</label>
                    <input
                      type="text"
                      value={tableNumber}
                      onChange={(e) => setTableNumber(e.target.value)}
                      placeholder="A12"
                    />
                  </div>
                ) : (
                  <div className="form-group form-group--required">
                    <label>آدرس <span className="required-mark">(اجباری)</span></label>
                    <textarea
                      value={customerAddress}
                      onChange={(e) => setCustomerAddress(e.target.value)}
                      placeholder="آدرس تحویل"
                      rows={2}
                    />
                  </div>
                )}

                <div className="form-group">
                  <label>روش پرداخت</label>
                  <select value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value as any)}>
                    <option value="cash">نقد</option>
                    <option value="card">کارت</option>
                    <option value="online">آنلاین</option>
                    <option value="mixed">ترکیبی</option>
                  </select>
                </div>

                <div className="form-group">
                  <label>تخفیف</label>
                  <div className="discount-type-toggle">
                    <button
                      type="button"
                      className={discountType === 'percentage' ? 'active' : ''}
                      onClick={() => setDiscountType('percentage')}
                    >
                      درصدی
                    </button>
                    <button
                      type="button"
                      className={discountType === 'fixed' ? 'active' : ''}
                      onClick={() => setDiscountType('fixed')}
                    >
                      تومانی
                    </button>
                  </div>
                  <input
                    type="number"
                    min={0}
                    max={discountType === 'percentage' ? 100 : undefined}
                    placeholder={discountType === 'percentage' ? 'مثال: 10' : 'مثال: 50000'}
                    value={discountAmount || ''}
                    onChange={(e) => setDiscountAmount(Number(e.target.value) || 0)}
                  />
                  {getDiscountAmount() > 0 && (
                    <small className="discount-summary">مبلغ تخفیف: {formatPrice(getDiscountAmount())}</small>
                  )}
                </div>

                <div className="form-group">
                  <label>یادداشت (اختیاری)</label>
                  <textarea
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="یادداشت برای آشپزخانه"
                    rows={2}
                  />
                </div>

                <div className="order-modal-totals">
                  <div className="total-row">
                    <span>جمع کل:</span>
                    <span>{formatPrice(getTotalAmount())}</span>
                  </div>
                  {getDiscountAmount() > 0 && (
                    <div className="total-row">
                      <span>تخفیف:</span>
                      <span>- {formatPrice(getDiscountAmount())}</span>
                    </div>
                  )}
                  <div className="total-row final">
                    <span>مبلغ نهایی:</span>
                    <span>{formatPrice(getFinalAmount())}</span>
                  </div>
                </div>

                {enabledPrinters.length > 0 && (
                  <p className="order-modal-print-note">
                    {enabledPrinters.length} پرینتر برای چاپ رسید فعال است.
                  </p>
                )}

                <div className="order-modal-actions">
                  <button
                    type="button"
                    className="order-modal-cancel"
                    onClick={() => setShowOrderModal(false)}
                    disabled={isSubmitting}
                  >
                    انصراف
                  </button>
                  <button
                    type="button"
                    className="submit-order-button"
                    onClick={handleSubmit}
                    disabled={isSubmitting || cart.length === 0}
                  >
                    {isSubmitting ? 'در حال ثبت...' : 'ثبت نهایی'}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

