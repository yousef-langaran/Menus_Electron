import { HashRouter, Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import { HeroUIProvider } from '@heroui/system';
import LoginPage from './pages/Login';
import OrderPage from './pages/Order';
import SettingsPage from './pages/Settings';
import OrdersPage from './pages/Orders';
import { useAuthStore } from './store/authStore';
import { usePrinterSettingsStore } from './store/printerSettingsStore';
import { useEffect } from 'react';
import { OrdersSocketManager } from './components/OrdersSocketManager';
import { UpdateBanner } from './components/UpdateBanner';
import { OfflineOrdersSync } from './components/OfflineOrdersSync';

function AppRoutes() {
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  return (
    <HeroUIProvider navigate={navigate} locale="fa-IR">
      <UpdateBanner />
      <OfflineOrdersSync />
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

