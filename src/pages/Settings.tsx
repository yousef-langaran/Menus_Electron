import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import { usePrinterSettingsStore } from '../store/printerSettingsStore';
import './Settings.css';

export default function SettingsPage() {
  const navigate = useNavigate();
  const { user, token, logout } = useAuthStore();
  const [isOnline, setIsOnline] = useState(true);
  const [syncStatus, setSyncStatus] = useState('');
  const [isLoadingPrinters, setIsLoadingPrinters] = useState(false);
  const [printerError, setPrinterError] = useState('');
  const [availablePrinters, setAvailablePrinters] = useState<Array<{ name: string; displayName?: string; description?: string }>>([]);
  const { configs, setPrinterEnabled, updatePrinterConfig, loadFromStorage } = usePrinterSettingsStore();

  useEffect(() => {
    checkOnlineStatus();
    const interval = setInterval(checkOnlineStatus, 5000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    loadFromStorage();
    loadPrinters();
  }, []);

  const checkOnlineStatus = async () => {
    if (window.electronAPI) {
      const online = await window.electronAPI.checkOnline();
      setIsOnline(online);
    } else {
      setIsOnline(navigator.onLine);
    }
  };

  const handleSync = async () => {
    if (!window.electronAPI) {
      setSyncStatus('این قابلیت فقط در Electron در دسترس است');
      return;
    }

    setSyncStatus('در حال همگام‌سازی...');
      if (!token) {
        setSyncStatus('برای ارسال سفارشات ابتدا وارد شوید.');
        return;
      }

      try {
        const result = await window.electronAPI.syncOrders(token);
      setSyncStatus(
        `همگام‌سازی انجام شد: ${result.success} موفق، ${result.failed} ناموفق`
      );
    } catch (error: any) {
      setSyncStatus(`خطا در همگام‌سازی: ${error.message}`);
    }
  };

  const loadPrinters = async () => {
    if (!window.electronAPI) return;
    setIsLoadingPrinters(true);
    setPrinterError('');
    try {
      const printers = await window.electronAPI.getPrinters();
      setAvailablePrinters(printers);
    } catch (error: any) {
      console.error('Printer load error:', error);
      setPrinterError(error?.message || 'خطا در دریافت لیست پرینترها');
    } finally {
      setIsLoadingPrinters(false);
    }
  };

  return (
    <div className="settings-page">
      <header className="settings-header">
        <h1>تنظیمات</h1>
        <button onClick={() => navigate('/order')} className="back-button">
          بازگشت
        </button>
      </header>

      <div className="settings-content">
        <div className="settings-section">
          <h2>اطلاعات کاربر</h2>
          <div className="info-item">
            <span>نام:</span>
            <span>{user?.firstName} {user?.lastName}</span>
          </div>
          <div className="info-item">
            <span>موبایل:</span>
            <span>{user?.mobile}</span>
          </div>
          <div className="info-item">
            <span>رستوران:</span>
            <span>{user?.restaurants?.[0]?.name || 'تعیین نشده'}</span>
          </div>
        </div>

        <div className="settings-section">
          <h2>وضعیت اتصال</h2>
          <div className="status-item">
            <span>وضعیت:</span>
            <span className={isOnline ? 'status-online' : 'status-offline'}>
              {isOnline ? 'آنلاین' : 'آفلاین'}
            </span>
          </div>
        </div>

        <div className="settings-section">
          <h2>همگام‌سازی</h2>
          <button onClick={handleSync} className="sync-button">
            همگام‌سازی سفارشات آفلاین
          </button>
          {syncStatus && (
            <div className="sync-status">{syncStatus}</div>
          )}
        </div>

        <div className="settings-section">
          <div className="section-header">
            <h2>تنظیمات پرینتر</h2>
            <button onClick={loadPrinters} className="link-button">
              بروزرسانی لیست
            </button>
          </div>
          {isLoadingPrinters ? (
            <p>در حال دریافت لیست پرینترها...</p>
          ) : printerError ? (
            <p className="text-danger">{printerError}</p>
          ) : availablePrinters.length === 0 ? (
            <p>هیچ پرینتری یافت نشد.</p>
          ) : (
            <div className="printer-settings">
              {availablePrinters.map((printer) => {
                const config = configs[printer.name];
                const isEnabled = !!config?.enabled;
                return (
                  <div key={printer.name} className="printer-card">
                    <div className="printer-card-header">
                      <label className="printer-checkbox">
                        <input
                          type="checkbox"
                          checked={isEnabled}
                          onChange={(e) => setPrinterEnabled(printer, e.target.checked)}
                        />
                        <span>{printer.displayName || printer.name}</span>
                      </label>
                      <span className="printer-description">{printer.description}</span>
                    </div>
                    {isEnabled && (
                      <div className="printer-config-grid">
                        <label>
                          عرض کاغذ (میلی‌متر)
                          <input
                            type="number"
                            value={config?.paperWidth ?? 80}
                            min={40}
                            max={120}
                            onChange={(e) =>
                              updatePrinterConfig(printer.name, { paperWidth: Number(e.target.value) || 80 })
                            }
                          />
                        </label>
                        <label>
                          طول کاغذ (میلی‌متر)
                          <input
                            type="number"
                            value={config?.paperLength ?? 200}
                            min={80}
                            max={800}
                            onChange={(e) =>
                              updatePrinterConfig(printer.name, { paperLength: Number(e.target.value) || 200 })
                            }
                          />
                        </label>
                        <label>
                          حاشیه (میلی‌متر)
                          <input
                            type="number"
                            value={config?.margin ?? 5}
                            min={0}
                            max={20}
                            onChange={(e) =>
                              updatePrinterConfig(printer.name, { margin: Number(e.target.value) || 5 })
                            }
                          />
                        </label>
                        <label>
                          تعداد چاپ
                          <input
                            type="number"
                            value={config?.copies ?? 1}
                            min={1}
                            max={5}
                            onChange={(e) =>
                              updatePrinterConfig(printer.name, { copies: Number(e.target.value) || 1 })
                            }
                          />
                        </label>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
          <p className="text-muted small">
            تنظیمات بالا برای چاپ خودکار رسید هنگام ثبت سفارش استفاده می‌شود.
          </p>
        </div>

        <div className="settings-section">
          <button onClick={logout} className="logout-button">
            خروج از حساب کاربری
          </button>
        </div>
      </div>
    </div>
  );
}

