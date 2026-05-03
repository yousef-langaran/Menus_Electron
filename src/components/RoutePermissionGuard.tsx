import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import { canAccessRoute } from '../lib/electronPermissions';

/** اگر مسیر فعلی با مجوزهای کاربر جور نباشد، به ثبت سفارش برمی‌گردد */
export function RoutePermissionGuard() {
  const user = useAuthStore((s) => s.user);
  const { pathname } = useLocation();

  if (!canAccessRoute(user, pathname)) {
    return <Navigate to="/order" replace />;
  }

  return <Outlet />;
}
