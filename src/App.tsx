import { HashRouter, Routes, Route, Navigate, Outlet, useNavigate } from 'react-router-dom';
import { I18nProvider } from 'react-aria-components';
import LoginPage from './pages/Login';
import OrderPage from './pages/Order';
import SettingsPage from './pages/Settings';
import OrdersPage from './pages/Orders';
import AccountingPage from './pages/Accounting';
import AccountingRawMaterialsPage from './pages/accounting/RawMaterials';
import AccountingSuppliersPage from './pages/accounting/Suppliers';
import AccountingPurchaseDraftsPage from './pages/accounting/PurchaseDrafts';
import AccountingServerPurchasesPage from './pages/accounting/ServerPurchases';
import ProductsPage from './pages/Products';
import CategoriesPage from './pages/Categories';
import { useAuthStore } from './store/authStore';
import { AppShellLayout } from './layouts/AppShellLayout';
import { RoutePermissionGuard } from './components/RoutePermissionGuard';
import { usePrinterSettingsStore } from './store/printerSettingsStore';
import { useEffect } from 'react';
import { OrdersSocketManager } from './components/OrdersSocketManager';
import { UpdateBanner } from './components/UpdateBanner';
import { OfflineOrdersSync } from './components/OfflineOrdersSync';
import { AccountingSyncManager } from './components/AccountingSyncManager';

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

function RequireAuth() {
  const user = useAuthStore((s) => s.user);
  if (!user) return <Navigate to="/login" replace />;
  return <Outlet />;
}

function AppRoutes() {
  const user = useAuthStore((s) => s.user);
  return (
    <I18nProvider locale="fa-IR">
      <UnauthorizedListener />
      <UpdateBanner />
      <OfflineOrdersSync />
      <AccountingSyncManager />
      <OrdersSocketManager />
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
              <Route path="/settings" element={<SettingsPage />} />
              <Route path="/products" element={<ProductsPage />} />
              <Route path="/categories" element={<CategoriesPage />} />
              <Route path="/accounting" element={<AccountingPage />} />
              <Route path="/accounting/raw-materials" element={<AccountingRawMaterialsPage />} />
              <Route path="/accounting/suppliers" element={<AccountingSuppliersPage />} />
              <Route path="/accounting/purchase-drafts" element={<AccountingPurchaseDraftsPage />} />
              <Route path="/accounting/server-purchases" element={<AccountingServerPurchasesPage />} />
            </Route>
          </Route>
        </Route>
        <Route path="/" element={<Navigate to={user ? '/order' : '/login'} replace />} />
      </Routes>
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
    <HashRouter>
      <div dir="rtl" className="h-full w-full">
        <AppRoutes />
      </div>
    </HashRouter>
  );
}

export default App;

