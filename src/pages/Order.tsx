import { useState, useEffect } from 'react';
import { useAuthStore } from '../store/authStore';
import { useOrderStore } from '../store/orderStore';
import { getProducts, checkUser } from '../services/api';
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
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [userExists, setUserExists] = useState<boolean | null>(null);
  const [isCheckingUser, setIsCheckingUser] = useState(false);
  const enabledPrinters = usePrinterSettingsStore((state) =>
    Object.values(state.configs).filter((config) => config.enabled)
  );

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
          
          const uniqueCategories = Array.from(
            new Set(productsData.map(p => p.category?.name_fa).filter(Boolean))
          );
          setCategories(uniqueCategories as string[]);
          
          // Cache the menu
          await cacheMenu(restaurantId || 0, restaurantName || '', productsData, uniqueCategories as string[]);
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
      alert('سفارش با موفقیت ثبت شد' + (result.offline ? ' (آفلاین)' : ''));
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

      <div className="order-content">
        <div className="products-section">
          <div className="category-filter">
            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
            >
              <option value="">همه دسته‌بندی‌ها</option>
              {categories.map(cat => (
                <option key={cat} value={cat}>{cat}</option>
              ))}
            </select>
          </div>

          {isLoading ? (
            <div className="loading">در حال بارگذاری...</div>
          ) : (
            <div className="products-grid">
              {filteredProducts.map(product => (
                <div
                  key={product.id}
                  className="product-card"
                  onClick={() => addToCart(product)}
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

        <div className="order-form-section">
          <div className="cart-section">
            <h2>سبد خرید</h2>
            {cart.length === 0 ? (
              <p className="empty-cart">سبد خرید خالی است</p>
            ) : (
              <div className="cart-items">
                {cart.map(item => (
                  <div key={item.productId} className="cart-item">
                    <div className="cart-item-info">
                      <span>{item.product.name_fa || item.product.name}</span>
                      <div className="cart-item-controls">
                        <button onClick={() => updateCartQuantity(item.productId, item.quantity - 1)}>
                          -
                        </button>
                        <span>{item.quantity}</span>
                        <button onClick={() => updateCartQuantity(item.productId, item.quantity + 1)}>
                          +
                        </button>
                      </div>
                    </div>
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
                ))}
                <div className="cart-totals">
                  <div className="total-row">
                    <span>جمع کل:</span>
                    <span>{formatPrice(getTotalAmount())}</span>
                  </div>
                  <div className="discount-row">
                    <label>نوع تخفیف</label>
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
                      placeholder={discountType === 'percentage' ? 'مثال: 10 (درصد)' : 'مثال: 50000 تومان'}
                      value={discountAmount || ''}
                      onChange={(e) => setDiscountAmount(Number(e.target.value) || 0)}
                    />
                    {getDiscountAmount() > 0 && (
                      <small className="discount-summary">
                        مبلغ تخفیف: {formatPrice(getDiscountAmount())}
                      </small>
                    )}
                  </div>
                  <div className="total-row final">
                    <span>مبلغ نهایی:</span>
                    <span>{formatPrice(getFinalAmount())}</span>
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className="customer-section">
            <h2>اطلاعات مشتری</h2>
            <div className="form-group">
              <label>شماره تماس</label>
              <div className="input-with-button">
                <input
                  type="text"
                  value={customerPhone}
                  onChange={(e) => {
                    setCustomerPhone(e.target.value);
                    setUserExists(null);
                  }}
                  placeholder="09123456789"
                />
                <button
                  type="button"
                  onClick={handleCheckUser}
                  disabled={isCheckingUser || !customerPhone.trim()}
                >
                  {isCheckingUser ? '...' : '✓'}
                </button>
              </div>
              {userExists === true && (
                <span className="user-status success">مشتری ثبت‌نام شده</span>
              )}
              {userExists === false && (
                <span className="user-status warning">مشتری جدید</span>
              )}
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
                <label>شماره میز</label>
                <input
                  type="text"
                  value={tableNumber}
                  onChange={(e) => setTableNumber(e.target.value)}
                  placeholder="A12"
                />
              </div>
            ) : (
              <div className="form-group">
                <label>آدرس</label>
                <textarea
                  value={customerAddress}
                  onChange={(e) => setCustomerAddress(e.target.value)}
                  placeholder="آدرس تحویل"
                  rows={3}
                />
              </div>
            )}

            <div className="form-group">
              <label>روش پرداخت</label>
              <select
                value={paymentMethod}
                onChange={(e) => setPaymentMethod(e.target.value as any)}
              >
                <option value="cash">نقد</option>
                <option value="card">کارت</option>
                <option value="online">آنلاین</option>
                <option value="mixed">ترکیبی</option>
              </select>
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

            <div className="form-group">
              <label>چاپ رسید</label>
              {enabledPrinters.length === 0 ? (
                <p className="text-muted">
                  هیچ پرینتری پیکربندی نشده است. لطفاً از بخش تنظیمات، پرینترهای مورد نظر را انتخاب کنید.
                </p>
              ) : (
                <p className="text-success">
                  {enabledPrinters.length} پرینتر برای چاپ رسید آماده است. (قابل تغییر در تنظیمات)
                </p>
              )}
            </div>

            <button
              onClick={handleSubmit}
              disabled={isSubmitting || cart.length === 0}
              className="submit-order-button"
            >
              {isSubmitting ? 'در حال ثبت...' : 'ثبت سفارش'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

