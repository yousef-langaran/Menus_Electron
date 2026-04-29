import { HashRouter, Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import { HeroUIProvider } from '@heroui/system';
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

function AppRoutes() {
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  return (
    <HeroUIProvider navigate={navigate} locale="fa-IR">
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
        <Route
          path="/order"
          element={user ? <OrderPage /> : <Navigate to="/login" replace />}
        />
        <Route
          path="/orders"
          element={user ? <OrdersPage /> : <Navigate to="/login" replace />}
        />
        <Route
          path="/settings"
          element={user ? <SettingsPage /> : <Navigate to="/login" replace />}
        />
        <Route
          path="/products"
          element={user ? <ProductsPage /> : <Navigate to="/login" replace />}
        />
        <Route
          path="/categories"
          element={user ? <CategoriesPage /> : <Navigate to="/login" replace />}
        />
        <Route
          path="/accounting"
          element={user ? <AccountingPage /> : <Navigate to="/login" replace />}
        />
        <Route
          path="/accounting/raw-materials"
          element={user ? <AccountingRawMaterialsPage /> : <Navigate to="/login" replace />}
        />
        <Route
          path="/accounting/suppliers"
          element={user ? <AccountingSuppliersPage /> : <Navigate to="/login" replace />}
        />
        <Route
          path="/accounting/purchase-drafts"
          element={user ? <AccountingPurchaseDraftsPage /> : <Navigate to="/login" replace />}
        />
        <Route
          path="/accounting/server-purchases"
          element={user ? <AccountingServerPurchasesPage /> : <Navigate to="/login" replace />}
        />
        <Route path="/" element={<Navigate to={user ? '/order' : '/login'} replace />} />
      </Routes>
    </HeroUIProvider>
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

