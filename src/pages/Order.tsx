import { useState, useEffect, useRef } from 'react';
import { useAuthStore } from '../store/authStore';
import { useOrderStore } from '../store/orderStore';
import { getProducts, getRestaurantByName, getRestaurantById, checkUser, getAssetBaseUrl, getCustomerAddresses, addCustomer, createCustomerAddress } from '../services/api';
import { getCachedMenu, cacheMenu } from '../services/cache';
import { useNavigate } from 'react-router-dom';
import { usePrinterSettingsStore } from '../store/printerSettingsStore';
import {
  saveReceiptNumbersToStorage,
  getNextReceiptNumberBrowser,
} from '../utils/receiptNumbersStorage';
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
  const [isMobileRequired, setIsMobileRequired] = useState(true);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [userExists, setUserExists] = useState<boolean | null>(null);
  const [isCheckingUser, setIsCheckingUser] = useState(false);
  /** نام مشتری لود شده بعد از تیک (چک کاربر) — برای نمایش و چاپ رسید */
  const [loadedCustomerFirstName, setLoadedCustomerFirstName] = useState('');
  const [loadedCustomerLastName, setLoadedCustomerLastName] = useState('');
  /** آیتمی که پنل توضیحاتش باز است (برای جمع‌وجور بودن صفحه) */
  const [expandedNoteProductId, setExpandedNoteProductId] = useState<number | null>(null);
  const { enabledPrinters, getPrinterReceipts } = usePrinterSettingsStore((state) => ({
    enabledPrinters: Object.values(state.configs).filter((config) => config.enabled),
    getPrinterReceipts: state.getPrinterReceipts,
  }));
  const phoneInputRef = useRef<HTMLInputElement>(null);
  /** ref پنل توضیحات باز — برای تشخیص کلیک داخل پنل در onBlur */
  const notePanelRef = useRef<HTMLDivElement | null>(null);
  /** نمایش پاپ‌آپ تکمیل سفارش (تخفیف + اطلاعات مشتری) */
  const [showOrderModal, setShowOrderModal] = useState(false);
  /** آدرس‌های ذخیره‌شده مشتری (برای بیرون‌بر) */
  const [customerAddresses, setCustomerAddresses] = useState<Array<{ id: number; address: string; label?: string; isDefault: boolean }>>([]);
  const [loadingAddresses, setLoadingAddresses] = useState(false);
  /** انتخاب آدرس: عدد = id آدرس ذخیره، 'new' = آدرس جدید تایپ شده */
  const [selectedAddressId, setSelectedAddressId] = useState<number | 'new' | null>(null);
  /** برای افزودن مشتری جدید */
  const [addCustomerFirstName, setAddCustomerFirstName] = useState('');
  const [addCustomerLastName, setAddCustomerLastName] = useState('');
  const [isAddingCustomer, setIsAddingCustomer] = useState(false);
  /** گزینه چاپ برای این سفارش: همه پرینترهای فعال، بدون چاپ، یا انتخاب پرینترها */
  const [printOption, setPrintOption] = useState<'all' | 'none' | 'select'>('all');
  /** وقتی printOption === 'select'، نام پرینترهای انتخاب‌شده */
  const [selectedPrinterNames, setSelectedPrinterNames] = useState<string[]>([]);

  const isElectronWithPrinters = typeof window !== 'undefined' && Boolean(window.electronAPI) && enabledPrinters.length > 0;

  useEffect(() => {
    loadProducts();
  }, []);

  // با باز شدن مودال، فوکوس روی فیلد موبایل
  useEffect(() => {
    if (showOrderModal) {
      const t = setTimeout(() => phoneInputRef.current?.focus(), 50);
      return () => clearTimeout(t);
    }
  }, [showOrderModal]);

  // وقتی مودال بسته است و سبد پر است، اینتر مودال را باز کن و فوکوس روی موبایل
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Enter' || showOrderModal) return;
      const target = e.target as HTMLElement;
      if (target.closest('.order-modal')) return;
      if (cart.length > 0 && !target.closest('input') && !target.closest('textarea') && !target.closest('button')) {
        setShowOrderModal(true);
        e.preventDefault();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [showOrderModal, cart.length]);

  // بارگذاری آدرس‌های مشتری وقتی موبایل عوض شد (بیرون‌بر + آنلاین)
  useEffect(() => {
    if (!showOrderModal || serviceType !== 'takeaway' || !token || !customerPhone.trim()) {
      setCustomerAddresses([]);
      setSelectedAddressId(null);
      return;
    }
    const phone = customerPhone.trim().replace(/\s/g, '');
    const normalized = phone.startsWith('9') && phone.length === 10 ? '0' + phone : phone;
    if (normalized.length < 10) {
      setCustomerAddresses([]);
      setSelectedAddressId(null);
      return;
    }
    const isOnline = window.electronAPI ? window.electronAPI.checkOnline() : Promise.resolve(navigator.onLine);
    const restaurantId = user?.restaurants?.[0]?.id;
    const restaurantName = user?.restaurants?.[0]?.name;
    if (!restaurantId && !restaurantName) return;

    let cancelled = false;
    setLoadingAddresses(true);
    isOnline.then((online) => {
      if (!online || cancelled) {
        setLoadingAddresses(false);
        return;
      }
      getCustomerAddresses(
        { restaurantId, restaurantName, phone: normalized },
        token,
      )
        .then((list) => {
          if (cancelled) return;
          setCustomerAddresses(list);
          const defaultOne = list.find((a) => a.isDefault) || list[0];
          if (defaultOne) {
            setSelectedAddressId(defaultOne.id);
            setCustomerAddress(defaultOne.address);
          } else {
            setSelectedAddressId(list.length > 0 ? list[0].id : 'new');
            if (list.length > 0) setCustomerAddress(list[0].address);
          }
        })
        .catch(() => {
          if (!cancelled) setCustomerAddresses([]);
          if (!cancelled) setSelectedAddressId('new');
        })
        .finally(() => {
          if (!cancelled) setLoadingAddresses(false);
        });
    });
    return () => { cancelled = true; };
  }, [showOrderModal, serviceType, customerPhone, token, user?.restaurants]);

  // Cache images when products change
  useEffect(() => {
    const cacheProductImages = async () => {
      if (products.length === 0 || !window.electronAPI?.cacheImages) return;

      const isOnline = window.electronAPI
        ? await window.electronAPI.checkOnline()
        : navigator.onLine;

      // فقط در حالت آنلاین عکس‌ها را cache کن
      if (isOnline) {
        const assetBase = getAssetBaseUrl();
        const imageUrls = products
          .map(p => p.multiMedia?.url)
          .filter(Boolean)
          .map(url => `${assetBase}${url}`);

        if (imageUrls.length > 0) {
          try {
            const result = await window.electronAPI.cacheImages(imageUrls);
            if (result.success && result.urls) {
              setImageCache(prev => ({ ...prev, ...result.urls }));
            }
          } catch (err) {
            console.warn('Failed to cache images:', err);
          }
        }
      }

      // همیشه سعی کن عکس‌های cache شده را لود کن (حتی در حالت آفلاین)
      if (window.electronAPI?.getCachedImage) {
        const assetBase = getAssetBaseUrl();
        const imageUrlMap: Record<string, string> = {};
        for (const product of products) {
          if (product.multiMedia?.url) {
            const fullUrl = `${assetBase}${product.multiMedia.url}`;
            try {
              const result = await window.electronAPI.getCachedImage(fullUrl);
              if (result.success && result.url) {
                imageUrlMap[fullUrl] = result.url;
              }
            } catch (err) {
              // ignore errors
            }
          }
        }
        if (Object.keys(imageUrlMap).length > 0) {
          setImageCache(prev => ({ ...prev, ...imageUrlMap }));
        }
      }
    };

    cacheProductImages();
  }, [products]);

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
        setIsMobileRequired(cached.isMobileRequiredInElectronPanel ?? true);
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
          let mobileReq = true;
          try {
            const restaurant = restaurantId
              ? await getRestaurantById(Number(restaurantId), token)
              : await getRestaurantByName(restaurantName || '', token);
            const raw = restaurant?.cartItemOptions;
            options = Array.isArray(raw) ? raw.filter((s: any) => s != null && String(s).trim()) : [];
            mobileReq = restaurant?.panelSettings?.isMobileRequiredInElectronPanel ?? true;
            setCartItemOptions(options);
            setIsMobileRequired(mobileReq);
          } catch (_) {
            setCartItemOptions((prev) => prev);
            setIsMobileRequired((prev) => prev);
          }

          const uniqueCategories = Array.from(
            new Set(productsData.map(p => p.category?.name_fa).filter(Boolean))
          );
          setCategories(uniqueCategories as string[]);

          // Cache the menu (including cart item options for offline)
          await cacheMenu(restaurantId || 0, restaurantName || '', productsData, uniqueCategories as string[], options, mobileReq);
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

    setLoadedCustomerFirstName('');
    setLoadedCustomerLastName('');
    setIsCheckingUser(true);
    try {
      const isOnline = window.electronAPI
        ? await window.electronAPI.checkOnline()
        : navigator.onLine;

      if (isOnline) {
        const response = await checkUser(customerPhone.trim());
        setUserExists(response.userExists || false);
        if (response.userExists && (response.firstName != null || response.lastName != null)) {
          setLoadedCustomerFirstName(response.firstName ?? '');
          setLoadedCustomerLastName(response.lastName ?? '');
        }
      } else {
        setUserExists(null);
      }
    } catch (err) {
      console.error('Error checking user:', err);
      setUserExists(null);
      setLoadedCustomerFirstName('');
      setLoadedCustomerLastName('');
    } finally {
      setIsCheckingUser(false);
    }
  };

  const handleSubmit = async () => {
    if (isMobileRequired && !customerPhone.trim()) {
      setError('شماره تماس را وارد کنید');
      phoneInputRef.current?.focus();
      return;
    }
    setError('');

    // اسنپ‌شات برای چاپ رسید وقتی سرویس جواب داد (آنلاین در پس‌زمینه)
    const snapshot = {
      customerPhone,
      serviceType,
      tableNumber,
      customerAddress,
      paymentMethod,
      notes,
      discountAmount,
      totalAmount: getTotalAmount(),
      finalAmount: getFinalAmount(),
      items: cart.map((item) => ({
        product: item.product,
        productName: item.product.name_fa || item.product.name,
        quantity: item.quantity,
        price: item.price,
        itemOption: item.itemOption || undefined,
      })),
    };

    const runPrint = (orderData: any, orderKeys: string[], options: { printOption: 'all' | 'none' | 'select'; selectedPrinterNames: string[] } = { printOption: 'all', selectedPrinterNames: [] }) => {
      const { printOption: opt, selectedPrinterNames: names } = options;
      (async () => {
        try {
          if (window.electronAPI) {
            let receiptNumber = 0;
            const shouldPrint = opt !== 'none';
            const printersToUse = opt === 'select' && names.length > 0
              ? enabledPrinters.filter((p) => names.includes(p.name))
              : opt === 'all' ? enabledPrinters : [];
            if (shouldPrint && printersToUse.length > 0) {
              const printerJobs = printersToUse.flatMap((printer) =>
                getPrinterReceipts(printer.name)
                  .filter((r) => r.enabled)
                  .map((receipt) => ({
                    name: printer.name,
                    displayName: printer.displayName,
                    paperWidth: printer.paperWidth,
                    paperLength: printer.paperLength,
                    margin: printer.margin,
                    receiptType: receipt.type,
                    copies: receipt.copies,
                  }))
              );
              if (printerJobs.length > 0) {
                const res = await window.electronAPI.printReceipt(orderData, printerJobs, orderKeys);
                receiptNumber = res?.receiptNumber ?? 0;
              } else {
                receiptNumber = await window.electronAPI.assignReceiptNumberForOrder(orderKeys);
              }
            } else {
              receiptNumber = await window.electronAPI.assignReceiptNumberForOrder(orderKeys);
            }
            if (receiptNumber > 0 && orderKeys.length) saveReceiptNumbersToStorage(orderKeys, receiptNumber);
          } else {
            const receiptNumber = getNextReceiptNumberBrowser();
            saveReceiptNumbersToStorage(orderKeys, receiptNumber);
          }
        } catch (err) {
          console.error('Print / assign receipt number error:', err);
        }
      })();
    };

    const onOrderCreated = (res: { orderId: number; orderNumber?: string; receiptCallNumber?: number; offline?: boolean }) => {
      const restaurantName = user?.restaurants?.[0]?.name_fa || user?.restaurants?.[0]?.name || '';
      const fullName = [loadedCustomerFirstName, loadedCustomerLastName].filter(Boolean).join(' ').trim();
      const orderData = {
        id: res.orderId,
        orderNumber: res.orderNumber ?? `ORD-${res.orderId}`,
        receiptCallNumber: res.receiptCallNumber ?? undefined,
        restaurantName,
        customerPhone: snapshot.customerPhone,
        customerName: fullName || snapshot.customerPhone,
        serviceType: snapshot.serviceType,
        tableNumber: snapshot.tableNumber,
        customerAddress: snapshot.customerAddress,
        paymentMethod: snapshot.paymentMethod,
        notes: snapshot.notes,
        items: snapshot.items,
        totalAmount: snapshot.totalAmount,
        discountAmount: snapshot.discountAmount,
        finalAmount: snapshot.finalAmount,
      };
      const orderKeys = res.offline
        ? [`offline-${res.orderId}`]
        : [String(res.orderId), res.orderNumber, orderData.orderNumber].filter(Boolean);
      runPrint(orderData, orderKeys, { printOption, selectedPrinterNames });
    };

    const result = await submitOrder({ onOrderCreated });

    if (result.success) {
      console.log('[شماره رسید] ثبت سفارش. orderId:', result.orderId, 'offline:', result.offline, 'pending:', result.pending);
      setError('');
      setSuccessMessage('سفارش ثبت شد' + (result.offline ? ' (آفلاین)' : ''));

      setShowOrderModal(false);
      clearCart();
      setUserExists(null);
      setLoadedCustomerFirstName('');
      setLoadedCustomerLastName('');
      setPrintOption('all');
      setSelectedPrinterNames([]);
      setTimeout(() => setSuccessMessage(''), 3000);

      // اگر بیرون‌بر و آدرس جدید بود، آن را در لیست آدرس‌های مشتری ذخیره کن
      const addressIsNew =
        snapshot.serviceType === 'takeaway' &&
        snapshot.customerAddress?.trim() &&
        (selectedAddressId === 'new' || customerAddresses.length === 0);
      if (
        addressIsNew &&
        token &&
        (window.electronAPI ? await window.electronAPI.checkOnline() : navigator.onLine)
      ) {
        const restaurantId = user?.restaurants?.[0]?.id;
        const restaurantName = user?.restaurants?.[0]?.name;
        const phone = snapshot.customerPhone.trim().replace(/\s/g, '');
        const normalized = phone.startsWith('9') && phone.length === 10 ? '0' + phone : phone;
        if ((restaurantId || restaurantName) && normalized.length >= 10) {
          createCustomerAddress(
            { restaurantId, restaurantName },
            { customerPhone: normalized, address: snapshot.customerAddress.trim() },
            token,
          ).catch((err) => console.warn('Failed to save new address:', err));
        }
      }
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
                        src={`${getAssetBaseUrl()}${product.multiMedia.url}`}
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
                      {item.product.multiMedia?.url && (
                        <div className="cart-item-thumb">
                          <img
                            src={`${getAssetBaseUrl()}${item.product.multiMedia.url}`}
                            alt=""
                            className="cart-item-image"
                          />
                        </div>
                      )}
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
              <div
                className="order-modal"
                onClick={(e) => e.stopPropagation()}
                onKeyDown={(e) => {
                  if (e.key !== 'Enter') return;
                  const isTextarea = (e.target as HTMLElement).tagName === 'TEXTAREA';
                  if (isTextarea) return;
                  e.preventDefault();
                  if (!isSubmitting && cart.length > 0 && (!isMobileRequired || customerPhone.trim())) handleSubmit();
                }}
              >
                <h2 className="order-modal-title">تکمیل و ثبت سفارش</h2>
                <p className="order-modal-hint">شماره موبایل را وارد کنید و Enter بزنید برای ثبت سریع</p>

                <div className={`form-group ${isMobileRequired ? 'form-group--required' : ''}`}>
                  <label>شماره تماس {isMobileRequired && <span className="required-mark">(اجباری)</span>}</label>
                  <div className="input-with-button">
                    <input
                      ref={phoneInputRef}
                      type="text"
                      value={customerPhone}
                      onChange={(e) => {
                        setCustomerPhone(e.target.value);
                        setUserExists(null);
                        setLoadedCustomerFirstName('');
                        setLoadedCustomerLastName('');
                        setSuccessMessage('');
                      }}
                      placeholder="09123456789"
                      autoComplete="tel"
                    />
                    <button type="button" onClick={handleCheckUser} disabled={isCheckingUser || !customerPhone.trim()}>
                      {isCheckingUser ? '...' : '✓'}
                    </button>
                  </div>
                  {userExists === true && (
                    <span className="user-status success">
                      {[loadedCustomerFirstName, loadedCustomerLastName].filter(Boolean).join(' ').trim() || 'مشتری ثبت‌نام شده'}
                    </span>
                  )}
                  {userExists === false && (
                    <div className="add-customer-block">
                      <span className="user-status warning">مشتری جدید</span>
                      <div className="add-customer-fields">
                        <input
                          type="text"
                          placeholder="نام (اختیاری)"
                          value={addCustomerFirstName}
                          onChange={(e) => setAddCustomerFirstName(e.target.value)}
                          className="add-customer-input"
                        />
                        <input
                          type="text"
                          placeholder="نام خانوادگی (اختیاری)"
                          value={addCustomerLastName}
                          onChange={(e) => setAddCustomerLastName(e.target.value)}
                          className="add-customer-input"
                        />
                        <button
                          type="button"
                          className="add-customer-btn"
                          onClick={async () => {
                            const phone = customerPhone.trim().replace(/\s/g, '');
                            const normalized = phone.startsWith('9') && phone.length === 10 ? '0' + phone : phone;
                            if (normalized.length < 10) return;
                            const restaurantId = user?.restaurants?.[0]?.id;
                            const restaurantName = user?.restaurants?.[0]?.name;
                            if (!token || (!restaurantId && !restaurantName)) return;
                            setIsAddingCustomer(true);
                            try {
                              await addCustomer(
                                { restaurantId, restaurantName },
                                {
                                  mobile: normalized,
                                  firstName: addCustomerFirstName.trim() || undefined,
                                  lastName: addCustomerLastName.trim() || undefined,
                                },
                                token,
                              );
                              setUserExists(true);
                              setAddCustomerFirstName('');
                              setAddCustomerLastName('');
                            } catch (err) {
                              console.error('Add customer failed:', err);
                            } finally {
                              setIsAddingCustomer(false);
                            }
                          }}
                          disabled={isAddingCustomer}
                        >
                          {isAddingCustomer ? '...' : 'افزودن به مشتریان'}
                        </button>
                      </div>
                    </div>
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
                      setCustomerAddresses([]);
                      setSelectedAddressId(null);
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
                    {loadingAddresses && <p className="address-load-hint">در حال بارگذاری آدرس‌ها...</p>}
                    {!loadingAddresses && customerAddresses.length > 0 && (
                      <div className="address-list">
                        {customerAddresses.map((addr) => (
                          <label key={addr.id} className="address-option">
                            <input
                              type="radio"
                              name="customerAddress"
                              checked={selectedAddressId === addr.id}
                              onChange={() => {
                                setSelectedAddressId(addr.id);
                                setCustomerAddress(addr.address);
                              }}
                            />
                            <span className="address-option-text">
                              {addr.label ? `${addr.label}: ` : ''}{addr.address}
                            </span>
                          </label>
                        ))}
                        <label className="address-option address-option--new">
                          <input
                            type="radio"
                            name="customerAddress"
                            checked={selectedAddressId === 'new'}
                            onChange={() => {
                              setSelectedAddressId('new');
                              setCustomerAddress('');
                            }}
                          />
                          <span className="address-option-text">آدرس جدید</span>
                        </label>
                      </div>
                    )}
                    {(selectedAddressId === 'new' || customerAddresses.length === 0) && (
                      <textarea
                        value={customerAddress}
                        onChange={(e) => {
                          setCustomerAddress(e.target.value);
                          if (customerAddresses.length > 0) setSelectedAddressId('new');
                        }}
                        placeholder="آدرس تحویل"
                        rows={2}
                      />
                    )}
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

                {isElectronWithPrinters && (
                  <div className="form-group print-options-group">
                    <label>چاپ رسید</label>
                    <div className="print-option-tabs">
                      <button
                        type="button"
                        className={`print-option-tab ${printOption === 'all' ? 'active' : ''}`}
                        onClick={() => setPrintOption('all')}
                      >
                        چاپ روی همه
                      </button>
                      <button
                        type="button"
                        className={`print-option-tab ${printOption === 'none' ? 'active' : ''}`}
                        onClick={() => setPrintOption('none')}
                      >
                        بدون چاپ
                      </button>
                      <button
                        type="button"
                        className={`print-option-tab ${printOption === 'select' ? 'active' : ''}`}
                        onClick={() => {
                          setPrintOption('select');
                          if (selectedPrinterNames.length === 0) {
                            setSelectedPrinterNames(enabledPrinters.map((p) => p.name));
                          }
                        }}
                      >
                        انتخاب پرینتر
                      </button>
                    </div>
                    {printOption === 'select' && (
                      <div className="print-select-list">
                        {enabledPrinters.map((printer) => (
                          <label key={printer.name} className="print-select-item">
                            <input
                              type="checkbox"
                              checked={selectedPrinterNames.includes(printer.name)}
                              onChange={(e) => {
                                if (e.target.checked) {
                                  setSelectedPrinterNames((prev) => [...prev, printer.name]);
                                } else {
                                  setSelectedPrinterNames((prev) => prev.filter((n) => n !== printer.name));
                                }
                              }}
                            />
                            <span>{printer.displayName || printer.name}</span>
                          </label>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {enabledPrinters.length > 0 && printOption === 'all' && (
                  <p className="order-modal-print-note">
                    {enabledPrinters.length} پرینتر برای چاپ رسید فعال است.
                  </p>
                )}
                {isElectronWithPrinters && printOption === 'none' && (
                  <p className="order-modal-print-note order-modal-print-note--muted">
                    این سفارش بدون چاپ رسید ثبت می‌شود.
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

