import { HashRouter, Routes, Route, Navigate } from 'react-router-dom';
import LoginPage from './pages/Login';
import OrderPage from './pages/Order';
import SettingsPage from './pages/Settings';
import OrdersPage from './pages/Orders';
import { useAuthStore } from './store/authStore';
import { usePrinterSettingsStore } from './store/printerSettingsStore';
import { useEffect } from 'react';
import { OrdersSocketManager } from './components/OrdersSocketManager';

function App() {
  const { user, loadCachedUser, isHydrated } = useAuthStore();
  const loadPrinterConfigs = usePrinterSettingsStore((state) => state.loadFromStorage);

  useEffect(() => {
    loadCachedUser();
    loadPrinterConfigs();
  }, [loadCachedUser, loadPrinterConfigs]);

  if (!isHydrated) {
    return (
      <div className="app-loading-screen">
        <p>در حال بارگذاری...</p>
      </div>
    );
  }

  return (
    <HashRouter>
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
        <Route path="/" element={<Navigate to={user ? "/order" : "/login"} replace />} />
      </Routes>
    </HashRouter>
  );
}

export default App;

