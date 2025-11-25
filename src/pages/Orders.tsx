import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import { fetchOrders, updateOrderStatus } from '../services/api';
import { getAllOrders } from '../services/offlineStorage';
import { usePrinterSettingsStore } from '../store/printerSettingsStore';
import './Orders.css';

const STATUS_OPTIONS = [
  { value: 'all', label: 'همه وضعیت‌ها' },
  { value: 'pending', label: 'در انتظار' },
  { value: 'confirmed', label: 'تایید شده' },
  { value: 'preparing', label: 'در حال آماده‌سازی' },
  { value: 'ready', label: 'آماده تحویل' },
  { value: 'delivered', label: 'تحویل شده' },
  { value: 'cancelled', label: 'لغو شده' },
];

const STATUS_LABELS: Record<string, string> = {
  pending: 'در انتظار',
  confirmed: 'تایید شده',
  preparing: 'در حال آماده‌سازی',
  ready: 'آماده تحویل',
  delivered: 'تحویل شده',
  cancelled: 'لغو شده',
};

const formatPrice = (price?: number) =>
  typeof price === 'number' ? `${new Intl.NumberFormat('fa-IR').format(price)} تومان` : '-';

const formatDate = (value?: string) => (value ? new Date(value).toLocaleString('fa-IR') : '-');

export default function OrdersPage() {
  const navigate = useNavigate();
  const { user, token, logout } = useAuthStore();
  const [statusFilter, setStatusFilter] = useState('all');
  const [onlineOrders, setOnlineOrders] = useState<any[]>([]);
  const [offlineOrders, setOfflineOrders] = useState<any[]>([]);
  const [onlineLoading, setOnlineLoading] = useState(false);
  const [offlineLoading, setOfflineLoading] = useState(false);
  const [onlineError, setOnlineError] = useState('');
  const [offlineError, setOfflineError] = useState('');
  const [statusUpdateLoading, setStatusUpdateLoading] = useState<number | null>(null);
  const [syncMessage, setSyncMessage] = useState('');
  const [syncInProgress, setSyncInProgress] = useState(false);
  const [isOnline, setIsOnline] = useState(true);
  const printerConfigs = usePrinterSettingsStore((state) => state.configs);
  const loadPrinterConfigs = usePrinterSettingsStore((state) => state.loadFromStorage);
  const [previewHtml, setPreviewHtml] = useState('');
  const [previewImage, setPreviewImage] = useState('');
  const [previewTitle, setPreviewTitle] = useState('');
  const [previewVisible, setPreviewVisible] = useState(false);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState('');

  const restaurantName = useMemo(() => user?.restaurants?.[0]?.name, [user]);
  const enabledPrinters = useMemo(
    () => Object.values(printerConfigs || {}).filter((config) => config.enabled),
    [printerConfigs]
  );
  const primaryPrinter = enabledPrinters[0];
  const isElectronEnv = typeof window !== 'undefined' && Boolean(window.electronAPI);
  const canPrint = isElectronEnv && enabledPrinters.length > 0;

  const detectOnlineStatus = async () => {
    try {
      if (window.electronAPI?.checkOnline) {
        return await window.electronAPI.checkOnline();
      }
    } catch (error) {
      console.error('Failed to check online status:', error);
    }
    return navigator.onLine;
  };

  useEffect(() => {
    loadPrinterConfigs();
  }, [loadPrinterConfigs]);

  useEffect(() => {
    let unsubscribe: (() => void) | undefined;

    const initialize = async () => {
      await loadOfflineOrders();
      const current = await detectOnlineStatus();
      setIsOnline(current);
      if (current) {
        await syncAndRefresh(true);
      }
    };

    initialize();

    if (window.electronAPI?.onOnlineStatusChange) {
      const cleanup = window.electronAPI.onOnlineStatusChange(async (status) => {
        setIsOnline(status);
        if (status) {
          await syncAndRefresh(true);
        } else {
          setOnlineOrders([]);
          setOnlineError('');
          setSyncMessage('شما آفلاین هستید. سفارشات جدید در حافظه نگهداری می‌شوند.');
          await loadOfflineOrders();
        }
      });
      if (typeof cleanup === 'function') {
        unsubscribe = cleanup;
      }
    } else {
      const handleOnline = () => syncAndRefresh(true);
      const handleOffline = () => {
        setIsOnline(false);
        setOnlineOrders([]);
        setOnlineError('');
        setSyncMessage('شما آفلاین هستید. سفارشات جدید در حافظه نگهداری می‌شوند.');
        loadOfflineOrders();
      };
      window.addEventListener('online', handleOnline);
      window.addEventListener('offline', handleOffline);
      unsubscribe = () => {
        window.removeEventListener('online', handleOnline);
        window.removeEventListener('offline', handleOffline);
      };
    }

    return () => {
      unsubscribe?.();
    };
  }, []);

  useEffect(() => {
    if (isOnline) {
      loadOnlineOrders();
    }
  }, [statusFilter, isOnline]);

  const loadOnlineOrders = async () => {
    if (!isOnline) return;
    if (!token) {
      setOnlineError('برای مشاهده سفارشات آنلاین، ابتدا وارد شوید.');
      setOnlineOrders([]);
      return;
    }
    setOnlineLoading(true);
    setOnlineError('');
    try {
      const params: Record<string, string> = {};
      if (restaurantName) {
        params.restaurantName = restaurantName;
      }
      if (statusFilter !== 'all') {
        params.status = statusFilter;
      }
      const response = await fetchOrders(params, token);
      const data = Array.isArray(response)
        ? response
        : Array.isArray(response?.data)
          ? response.data
          : [];
      setOnlineOrders(data);
    } catch (error: any) {
      console.error('Failed to fetch orders:', error);
      setOnlineError(error?.response?.data?.message || 'خطا در دریافت سفارشات آنلاین');
    } finally {
      setOnlineLoading(false);
    }
  };

  const loadOfflineOrders = async () => {
    setOfflineLoading(true);
    setOfflineError('');
    try {
      const orders = await getAllOrders();
      const unsynced = Array.isArray(orders) ? orders.filter((order) => !order.synced) : [];
      setOfflineOrders(unsynced);
    } catch (error) {
      console.error('Failed to load offline orders:', error);
      setOfflineError('خطا در دریافت سفارشات آفلاین');
    } finally {
      setOfflineLoading(false);
    }
  };

  const handleStatusChange = async (orderId: number, status: string) => {
    setStatusUpdateLoading(orderId);
    try {
      await updateOrderStatus(orderId, status, token || undefined);
      await loadOnlineOrders();
    } catch (error: any) {
      console.error('Failed to update status:', error);
      setOnlineError(error?.response?.data?.message || 'خطا در تغییر وضعیت سفارش');
    } finally {
      setStatusUpdateLoading(null);
    }
  };

  const syncAndRefresh = async (auto = false) => {
        if (!window.electronAPI?.syncOrders) {
      await loadOnlineOrders();
      return;
    }

    setSyncInProgress(true);
    setSyncMessage(auto ? 'در حال همگام‌سازی خودکار سفارشات...' : 'در حال ارسال سفارشات آفلاین...');
    try {
          const result = await window.electronAPI.syncOrders(token || undefined);
        if (result) {
          const unauthorizedError = Array.isArray(result.errors)
            ? result.errors.find((msg: string) => typeof msg === 'string' && /unauthorized/i.test(msg))
            : null;

          if (unauthorizedError) {
            setSyncMessage('نشست شما منقضی شده است. لطفاً دوباره وارد شوید و سپس همگام‌سازی را تکرار کنید.');
            if (!auto) {
              await logout();
              navigate('/login');
            }
            return;
          }

          setSyncMessage(`ارسال انجام شد: ${result.success} موفق، ${result.failed} ناموفق`);
        }
      await loadOfflineOrders();
      await loadOnlineOrders();
    } catch (error: any) {
      console.error('Sync error:', error);
      setSyncMessage(error?.message || 'خطا در همگام‌سازی سفارشات آفلاین');
    } finally {
      setSyncInProgress(false);
    }
  };

  const handleManualSync = () => {
    if (!isOnline) {
      setSyncMessage('برای ارسال سفارشات آفلاین ابتدا باید آنلاین شوید.');
      return;
    }
    syncAndRefresh();
  };

  const normalizeOrderForReceipt = (order: any, isOffline = false) => {
    if (!isOffline) {
      return order;
    }
    const payload = { ...(order?.orderData || {}) };
    if (!payload.orderNumber) {
      payload.orderNumber = order.orderData?.orderNumber || order.id;
    }
    if (!payload.id) {
      payload.id = order.id;
    }
    if (!payload.createdAt) {
      payload.createdAt = order.createdAt;
    }
    if (!payload.items && order.orderData?.items) {
      payload.items = order.orderData.items;
    }
    return payload;
  };

  const openReceiptPreview = async (orderPayload: any, title: string) => {
    setPreviewTitle(title);
    setPreviewHtml('');
    setPreviewError('');
    setPreviewImage('');
    setPreviewVisible(true);
    setPreviewLoading(true);
    try {
      const width = primaryPrinter?.paperWidth ?? 80;
      const margin = primaryPrinter?.margin ?? 5;
      if (window.electronAPI?.generateReceiptPreview) {
        const result = await window.electronAPI.generateReceiptPreview(orderPayload, { paperWidth: width, margin });
        if (!result?.success) {
          throw new Error(result?.error || 'امکان ساخت پیش‌نمایش وجود ندارد.');
        }
        setPreviewHtml(result.html || '');
        setPreviewImage(result.imageDataUrl || '');
      } else {
        setPreviewHtml(
          `<pre style="direction:rtl;font-family:Tahoma;padding:16px;margin:0;background:#fff">${JSON.stringify(
            orderPayload,
            null,
            2
          )}</pre>`
        );
      }
    } catch (error: any) {
      console.error('Preview error:', error);
      setPreviewError(error?.message || 'خطا در ساخت پیش‌نمایش رسید');
    } finally {
      setPreviewLoading(false);
    }
  };

  const handlePreviewOrder = (order: any, isOffline = false) => {
    const normalized = normalizeOrderForReceipt(order, isOffline);
    const title = isOffline
      ? `پیش‌نمایش سفارش آفلاین #${order?.id || ''}`
      : `پیش‌نمایش سفارش #${order?.orderNumber || order?.id || ''}`;
    openReceiptPreview(normalized, title);
  };

  const handleReprint = async (order: any, isOffline = false) => {
    if (!window.electronAPI?.printReceipt) {
      setSyncMessage('چاپ فقط در نسخه دسکتاپ قابل استفاده است.');
      return;
    }
    if (!enabledPrinters.length) {
      setSyncMessage('ابتدا در صفحه تنظیمات، حداقل یک پرینتر را فعال کنید.');
      return;
    }
    const printerJobs = enabledPrinters.map((printer) => ({
      name: printer.name,
      displayName: printer.displayName,
      paperWidth: printer.paperWidth,
      paperLength: printer.paperLength,
      margin: printer.margin,
      copies: printer.copies,
    }));
    try {
      await window.electronAPI.printReceipt(normalizeOrderForReceipt(order, isOffline), printerJobs);
      setSyncMessage('دستور چاپ با موفقیت ارسال شد.');
    } catch (error: any) {
      console.error('Reprint error:', error);
      setSyncMessage(error?.message || 'خطا در ارسال به پرینتر');
    }
  };

  const closePreview = () => {
    setPreviewVisible(false);
    setPreviewHtml('');
    setPreviewError('');
    setPreviewImage('');
    setPreviewTitle('');
    setPreviewLoading(false);
  };

  const renderOnlineOrders = () => {
    if (onlineLoading) {
      return <div className="empty-state">در حال بارگذاری...</div>;
    }
    if (onlineError) {
      return <div className="error-text">{onlineError}</div>;
    }
    if (!onlineOrders.length) {
      return <div className="empty-state">سفارشی برای نمایش وجود ندارد.</div>;
    }
    return (
      <div className="orders-list">
        {onlineOrders.map((order: any) => (
          <div key={order.id} className="order-card">
            <div className="order-card-header">
              <h3>سفارش #{order.orderNumber || order.id}</h3>
              <span className={`order-status status-${order.status}`}>
                {STATUS_LABELS[order.status] || order.status}
              </span>
            </div>
            <div className="order-info-grid">
              <div>مشتری: {order.customerName || order.customerPhone || '---'}</div>
              <div>تلفن: {order.customerPhone || '---'}</div>
              <div>نوع: {order.serviceType === 'dine_in' ? 'داخل سالن' : 'بیرون‌بر'}</div>
              <div>پرداخت: {order.paymentMethod || '---'}</div>
              <div>مبلغ کل: {formatPrice(order.totalAmount)}</div>
              <div>تخفیف: {formatPrice(order.discountAmount)}</div>
              <div>مبلغ نهایی: {formatPrice(order.finalAmount)}</div>
              <div>تاریخ: {formatDate(order.createdAt)}</div>
            </div>
            {order.notes && (
              <p className="muted">
                <strong>یادداشت:</strong> {order.notes}
              </p>
            )}
            {order.items?.length > 0 && (
              <ul className="order-items">
                {order.items.map((item: any, idx: number) => (
                  <li key={idx}>
                    {item.product?.name_fa || item.productName || 'محصول'} - {item.quantity} ×{' '}
                    {formatPrice(item.price)}
                  </li>
                ))}
              </ul>
            )}
            <div className="order-actions">
              <button type="button" className="ghost-button" onClick={() => handlePreviewOrder(order)}>
                پیش‌نمایش رسید
              </button>
              <button
                type="button"
                className="ghost-button"
                onClick={() => handleReprint(order)}
                disabled={!canPrint}
              >
                چاپ مجدد
              </button>
              <select
                value={order.status}
                onChange={(e) => handleStatusChange(order.id, e.target.value)}
                disabled={statusUpdateLoading === order.id}
              >
                {STATUS_OPTIONS.filter((opt) => opt.value !== 'all').map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
              <span className="muted">وضعیت سفارش را به‌روزرسانی کنید.</span>
            </div>
          </div>
        ))}
      </div>
    );
  };

  const renderOfflineOrders = () => {
    if (offlineLoading) {
      return <div className="empty-state">در حال بارگذاری سفارشات آفلاین...</div>;
    }
    if (offlineError) {
      return <div className="error-text">{offlineError}</div>;
    }
    if (!offlineOrders.length) {
      return <div className="empty-state">سفارشی در حافظه آفلاین وجود ندارد.</div>;
    }
    return (
      <div className="orders-list">
        {offlineOrders.map((order: any) => (
          <div key={order.id} className="order-card offline-order-card">
            <div className="order-card-header">
              <h3>سفارش آفلاین #{order.id}</h3>
              <span className="order-status status-pending">در انتظار ارسال</span>
            </div>
            <div className="order-info-grid">
              <div>مشتری: {order.orderData?.customerPhone || '---'}</div>
              <div>نوع: {order.orderData?.serviceType === 'dine_in' ? 'داخل سالن' : 'بیرون‌بر'}</div>
              <div>مبلغ کل: {formatPrice(order.orderData?.totalAmount)}</div>
              <div>مبلغ نهایی: {formatPrice(order.orderData?.finalAmount)}</div>
              <div>تاریخ ثبت: {formatDate(order.createdAt)}</div>
            </div>
            {order.orderData?.notes && (
              <p className="muted">
                <strong>یادداشت:</strong> {order.orderData.notes}
              </p>
            )}
            {order.orderData?.items?.length > 0 && (
              <ul className="order-items">
                {order.orderData.items.map((item: any, idx: number) => (
                  <li key={idx}>
                    {item.product?.name_fa || item.productName || 'محصول'} - {item.quantity} ×{' '}
                    {formatPrice(item.price)}
                  </li>
                ))}
              </ul>
            )}
            <div className="order-actions">
              <button type="button" className="ghost-button" onClick={() => handlePreviewOrder(order, true)}>
                پیش‌نمایش رسید
              </button>
              <button
                type="button"
                className="ghost-button"
                onClick={() => handleReprint(order, true)}
                disabled={!canPrint}
              >
                چاپ مجدد
              </button>
              <span className="muted">این سفارش به محض اتصال ارسال می‌شود.</span>
            </div>
          </div>
        ))}
      </div>
    );
  };

  return (
    <div className="orders-page">
      <header className="orders-header">
        <h1>لیست سفارشات</h1>
        <div className="orders-header-actions">
          <button className="secondary" onClick={() => navigate('/order')}>
            ثبت سفارش
          </button>
          <button className="secondary" onClick={() => navigate('/settings')}>
            تنظیمات
          </button>
          <button className="primary" onClick={logout}>
            خروج
          </button>
        </div>
      </header>

      <div className="orders-content">
        <div className="orders-section">
          <div className="orders-mode">
            <div className={`connection-status ${isOnline ? 'online' : 'offline'}`}>
              <span className="status-dot" />
              <span>{isOnline ? 'شما آنلاین هستید' : 'شما آفلاین هستید'}</span>
            </div>
            <div className="orders-mode-actions">
              <button
                className="sync-button"
                onClick={handleManualSync}
                disabled={syncInProgress || !isOnline}
              >
                {syncInProgress
                  ? 'در حال همگام‌سازی...'
                  : isOnline
                    ? 'ارسال سفارشات آفلاین'
                    : 'در انتظار اتصال'}
              </button>
            </div>
          </div>

          {syncMessage && <div className="sync-status">{syncMessage}</div>}
          {!isOnline && offlineOrders.length > 0 && (
            <p className="muted">
              {offlineOrders.length} سفارش در صف ارسال قرار دارد و پس از اتصال به اینترنت به صورت خودکار ارسال می‌شود.
            </p>
          )}

          {isOnline && (
            <div className="orders-filters">
              <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
                {STATUS_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
              <button onClick={loadOnlineOrders}>بروزرسانی</button>
            </div>
          )}

          <h2>{isOnline ? 'سفارشات آنلاین' : 'سفارشات آفلاین (در انتظار اتصال)'}</h2>

          {isOnline ? renderOnlineOrders() : renderOfflineOrders()}
        </div>
      </div>
      {previewVisible && (
        <div className="receipt-preview-backdrop">
          <div className="receipt-preview-modal">
            <div className="preview-header">
              <h3>{previewTitle || 'پیش‌نمایش رسید'}</h3>
              <button className="preview-close-btn" onClick={closePreview}>
                ×
              </button>
            </div>
            <div className="preview-body">
              {previewLoading ? (
                <div className="empty-state">در حال آماده‌سازی پیش‌نمایش...</div>
              ) : previewError ? (
                <div className="error-text">{previewError}</div>
              ) : previewImage ? (
                <img src={previewImage} alt="receipt-preview" className="receipt-preview-image" />
              ) : (
                <iframe title="receipt-preview" className="receipt-preview-frame" srcDoc={previewHtml || ''} />
              )}
            </div>
            <div className="preview-actions">
              <button onClick={closePreview}>بستن</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}



