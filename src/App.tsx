import { HashRouter, Routes, Route, Navigate, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { I18nProvider } from 'react-aria-components';
import { Toast } from '@heroui/react';
import { lazy, Suspense, useEffect } from 'react';
import { useAuthStore } from './store/authStore';
import { AppShellLayout } from './layouts/AppShellLayout';
import { RoutePermissionGuard } from './components/RoutePermissionGuard';
import { usePrinterSettingsStore } from './store/printerSettingsStore';
import { OrdersSocketManager } from './components/OrdersSocketManager';
import { UpdateBanner } from './components/UpdateBanner';
import { OfflineOrdersSync } from './components/OfflineOrdersSync';
import { AccountingSyncManager } from './components/AccountingSyncManager';
import { CatalogSyncManager } from './components/CatalogSyncManager';
import { ServiceJobsSyncManager } from './components/ServiceJobsSyncManager';
import { CallerIdOverlay } from './components/CallerIdOverlay';
import { useCallerIdStore } from './store/callerIdStore';
import { ErrorBoundary } from './components/ErrorBoundary';

// صفحات اصلی — eager (همیشه لازم هستند)
import LoginPage from './pages/Login';
import OrderPage from './pages/order';

// صفحات ثانوی — lazy (فقط وقتی نیاز باشد لود می‌شوند)
const SettingsPage = lazy(() => import('./pages/Settings'));
const OrdersPage = lazy(() => import('./pages/Orders'));
const OrderReturnsPage = lazy(() => import('./pages/OrderReturns'));
const KdsPage = lazy(() => import('./pages/Kds'));
const AccountingPage = lazy(() => import('./pages/Accounting'));
const AccountingRawMaterialsPage = lazy(() => import('./pages/accounting/RawMaterials'));
const AccountingSuppliersPage = lazy(() => import('./pages/accounting/Suppliers'));
const AccountingPurchaseDraftsPage = lazy(() => import('./pages/accounting/PurchaseDrafts'));
const AccountingServerPurchasesPage = lazy(() => import('./pages/accounting/ServerPurchases'));
const AccountingPurchaseReturnsPage = lazy(() => import('./pages/accounting/PurchaseReturns'));
const AccountingExpensesPage = lazy(() => import('./pages/accounting/Expenses'));
const AccountingRawMaterialCategoriesPage = lazy(() => import('./pages/accounting/RawMaterialCategories'));
const AccountingExpenseCategoriesPage = lazy(() => import('./pages/accounting/ExpenseCategories'));
const AccountingKardexPage = lazy(() => import('./pages/accounting/Kardex'));
const CashAccountsPage = lazy(() => import('./pages/accounting/CashAccounts'));
const ProductsPage = lazy(() => import('./pages/Products'));
const CategoriesPage = lazy(() => import('./pages/Categories'));
const CardTerminalsPage = lazy(() => import('./pages/CardTerminals'));
const CallHistoryPage = lazy(() => import('./pages/CallHistoryPage'));
const ServiceJobsPage = lazy(() => import('./pages/ServiceJobs'));

/** پس از 401 از API، خروج از نشست و رفتن به صفحهٔ ورود (بدون وابستگی دایره‌ای به axios) */
function UnauthorizedListener() {
  const navigate = useNavigate();

  useEffect(() => {
    const on401 = () => {
      void (async () => {
        try {
          await useAuthStore.getState().logout();
        } catch (e) {
          console.warn('[Auth] logout after 401:', e);
        }
        navigate('/login', { replace: true });
      })();
    };
    window.addEventListener('menus-electron:unauthorized', on401);
    return () => window.removeEventListener('menus-electron:unauthorized', on401);
  }, [navigate]);

  return null;
}

function GlobalShortcutListener() {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const user = useAuthStore((s) => s.user);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'F2') return;
      if (!user) return;

      event.preventDefault();

      if (pathname === '/order') {
        window.dispatchEvent(new Event('menus-electron:reset-order-session'));
        return;
      }

      navigate('/order');
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [navigate, pathname, user]);

  return null;
}

/** لینک secoin://order/<id> را می‌گیرد و به /orders?openOrderId=<id> ناوبری می‌کند */
function DeepLinkListener() {
  const navigate = useNavigate();

  useEffect(() => {
    const api = window.electronAPI;
    if (!api?.onDeepLinkOpenOrder) return;

    const unsub = api.onDeepLinkOpenOrder((url) => {
      try {
        const parsed = new URL(url);
        const isOrderLink = parsed.hostname === 'order' || parsed.pathname.startsWith('/order/');
        const rawId = isOrderLink
          ? (parsed.hostname === 'order' ? parsed.pathname : parsed.pathname.replace('/order', '')).replace(/^\/+/, '')
          : '';
        const orderId = rawId.split('/')[0];
        if (orderId) {
          navigate(`/orders?openOrderId=${encodeURIComponent(orderId)}`);
        }
      } catch (e) {
        console.warn('[DeepLink] failed to parse url:', url, e);
      }
    });

    return () => unsub?.();
  }, [navigate]);

  return null;
}

function RequireAuth() {
  const user = useAuthStore((s) => s.user);
  if (!user) return <Navigate to="/login" replace />;
  return <Outlet />;
}

function CallerIdManager() {
  const { handleIncomingCall, loadSettings, settings } = useCallerIdStore();
  const { token, user } = useAuthStore();
  const restaurantId = user?.restaurants?.[0]?.id ?? null;

  useEffect(() => {
    loadSettings();
  }, []);

  useEffect(() => {
    const api = window.electronAPI;
    if (!api?.onIncomingCall || !settings?.enabled) return;
    const unsub = api.onIncomingCall(({ phone, timestamp }) => {
      if (!token || !restaurantId) return;
      handleIncomingCall(phone, timestamp, restaurantId, token);
    });
    return () => unsub?.();
  }, [settings?.enabled, token, restaurantId]);

  return null;
}

function AppRoutes() {
  const user = useAuthStore((s) => s.user);
  return (
    // توجه: این Provider از نسخهٔ react-aria-components ِ خودِ اپ می‌آید، ولی HeroUI
    // نسخهٔ nested خودش را import می‌کند؛ پس کانتکست بین‌شان مشترک نیست و جهت RTL ِ
    // کامپوننت‌های HeroUI از لوکیل اپ می‌آید (سوییچ `lang` در electron/main.ts).
    <I18nProvider locale="fa-IR">
      <Toast.Provider placement="top start" maxVisibleToasts={4} />
      <UnauthorizedListener />
      <GlobalShortcutListener />
      <DeepLinkListener />
      <UpdateBanner />
      <OfflineOrdersSync />
      <AccountingSyncManager />
      <CatalogSyncManager />
      <ServiceJobsSyncManager />
      <OrdersSocketManager />
      <CallerIdManager />
      <CallerIdOverlay />
      <Suspense fallback={<div className="min-h-screen flex items-center justify-center bg-default-100" dir="rtl"><p className="text-default-500 text-sm animate-pulse">در حال بارگذاری...</p></div>}>
        <Routes>
          <Route
            path="/login"
            element={user ? <Navigate to="/order" replace /> : <LoginPage />}
          />
          <Route element={<RequireAuth />}>
            <Route element={<AppShellLayout />}>
              <Route element={<RoutePermissionGuard />}>
                <Route path="/order" element={<OrderPage />} />
                <Route path="/orders" element={<OrdersPage />} />
                <Route path="/order-returns" element={<OrderReturnsPage />} />
                <Route path="/kds" element={<KdsPage />} />
                <Route path="/settings" element={<SettingsPage />} />
                <Route path="/products" element={<ProductsPage />} />
                <Route path="/categories" element={<CategoriesPage />} />
                <Route path="/accounting" element={<AccountingPage />} />
                <Route path="/accounting/raw-materials" element={<AccountingRawMaterialsPage />} />
                <Route path="/accounting/suppliers" element={<AccountingSuppliersPage />} />
                <Route path="/accounting/purchase-drafts" element={<AccountingPurchaseDraftsPage />} />
                <Route path="/accounting/server-purchases" element={<AccountingServerPurchasesPage />} />
                <Route path="/accounting/expenses" element={<AccountingExpensesPage />} />
                <Route path="/accounting/raw-material-categories" element={<AccountingRawMaterialCategoriesPage />} />
                <Route path="/accounting/expense-categories" element={<AccountingExpenseCategoriesPage />} />
                <Route path="/accounting/cash-accounts" element={<CashAccountsPage />} />
                <Route path="/accounting/purchase-returns" element={<AccountingPurchaseReturnsPage />} />
                <Route path="/accounting/kardex" element={<AccountingKardexPage />} />
                <Route path="/card-terminals" element={<CardTerminalsPage />} />
                <Route path="/call-history" element={<CallHistoryPage />} />
                <Route path="/service-jobs" element={<ServiceJobsPage />} />
              </Route>
            </Route>
          </Route>
          <Route path="/" element={<Navigate to={user ? '/order' : '/login'} replace />} />
          <Route path="*" element={<Navigate to={user ? '/order' : '/login'} replace />} />
        </Routes>
      </Suspense>
    </I18nProvider>
  );
}

function App() {
  const { loadCachedUser, isHydrated } = useAuthStore();
  const loadPrinterConfigs = usePrinterSettingsStore((state) => state.loadFromStorage);

  useEffect(() => {
    loadCachedUser();
    loadPrinterConfigs();
  }, [loadCachedUser, loadPrinterConfigs]);

  if (!isHydrated) {
    return (
      <div className="app-loading-screen" dir="rtl">
        <p>در حال بارگذاری...</p>
      </div>
    );
  }

  return (
    <ErrorBoundary>
      <HashRouter>
        <div dir="rtl" className="h-full w-full">
          <AppRoutes />
        </div>
      </HashRouter>
    </ErrorBoundary>
  );
}

export default App;
