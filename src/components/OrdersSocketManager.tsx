import { useCallback, useEffect, useMemo, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { connectOrdersSocket, disconnectOrdersSocket } from '../services/ordersSocket';
import { attachOrdersSocketPanelSidecar } from '../services/ordersSocketPanelSidecar';
import { useAuthStore } from '../store/authStore';
import { canAccessRoute } from '../lib/electronPermissions';

const formatPrice = (value?: number) => {
  if (typeof value !== 'number') {
    return '';
  }
  return new Intl.NumberFormat('fa-IR').format(value) + ' ریال';
};

const useNotificationPermission = () => {
  const permissionRequestRef = useRef<Promise<boolean> | null>(null);

  return useCallback(() => {
    if (typeof window === 'undefined' || typeof Notification === 'undefined') {
      return Promise.resolve(false);
    }

    if (Notification.permission === 'granted') {
      return Promise.resolve(true);
    }

    if (Notification.permission === 'denied') {
      return Promise.resolve(false);
    }

    if (!permissionRequestRef.current) {
      permissionRequestRef.current = Notification.requestPermission().then(
        (result) => result === 'granted',
      );
    }

    return permissionRequestRef.current;
  }, []);
};

const showFallbackMessage = (title: string, body: string) => {
  if (window.electronAPI?.showMessageBox) {
    window.electronAPI.showMessageBox({
      type: 'info',
      title,
      message: body,
    });
  }
};

export function OrdersSocketManager() {
  const { user, token } = useAuthStore();
  const restaurantName = useMemo(() => user?.restaurants?.[0]?.name?.trim(), [user]);
  const location = useLocation();
  // صفحات /orders و /kds خودشان یک اتصال سوکت مستقل و زنده مدیریت می‌کنند؛
  // این منیجر سراسری فقط برای اعلان دسکتاپ در بقیهٔ صفحات وصل می‌شود تا
  // دو اتصال هم‌زمان یا اعلان تکراری روی همان صفحه‌ای که خودش زنده است رخ ندهد.
  const isOrdersPage = location.pathname === '/orders' || location.pathname === '/kds';
  const ensurePermission = useNotificationPermission();
  const restaurantKeyRef = useRef<string | null>(null);

  useEffect(() => {
    // سوکت زنده سفارشات فقط برای کاربری که دسترسی لیست سفارشات دارد برقرار می‌شود؛
    // در غیر این صورت هیچ اتصالی ساخته نمی‌شود.
    // کاربری که فقط دسترسی «فراخوان گارسون» دارد هم باید سوکت زنده داشته
    // باشد، وگرنه پیجر نرم‌افزاری برای گارسون‌های بدون دسترسی سفارش کار نمی‌کند.
    const canUseLiveSocket =
      !!user &&
      (canAccessRoute(user, '/orders') || canAccessRoute(user, '/waiter-calls'));
    if (isOrdersPage || !canUseLiveSocket || !token || !restaurantName) {
      disconnectOrdersSocket();
      restaurantKeyRef.current = null;
      return;
    }

    const socket = connectOrdersSocket({ token, restaurantName });
    if (!socket) {
      return;
    }

    const detachPanel = attachOrdersSocketPanelSidecar(socket);

    restaurantKeyRef.current = restaurantName.toLowerCase();

    const dispatchBrowserEvent = (eventName: string, payload: any) => {
      if (typeof window === 'undefined') {
        return;
      }
      window.dispatchEvent(new CustomEvent(eventName, { detail: payload }));
    };

    const maybeNotify = (order: any) => {
      if (isOrdersPage) {
        return;
      }

      const title = `سفارش جدید ${order?.orderNumber || ''}`.trim();
      const parts = [
        order?.customerName || order?.customerPhone || 'مشتری جدید',
        formatPrice(order?.finalAmount ?? order?.totalAmount),
      ].filter(Boolean);
      const body = parts.join(' • ');

      ensurePermission()
        .then((allowed) => {
          if (allowed && typeof Notification !== 'undefined') {
            const notification = new Notification(title || 'سفارش جدید', {
              body: body || 'سفارش جدید ثبت شد.',
              silent: false,
            });
            notification.onclick = () => {
              window.focus();
            };
          } else {
            showFallbackMessage(title || 'سفارش جدید', body || 'سفارش جدید ثبت شد.');
          }
        })
        .catch(() => {
          showFallbackMessage(title || 'سفارش جدید', body || 'سفارش جدید ثبت شد.');
        });
    };

    const handleNewOrder = (order: any) => {
      dispatchBrowserEvent('orders:new', order);
      maybeNotify(order);
    };

    const handleOrderUpdated = (order: any) => {
      dispatchBrowserEvent('orders:updated', order);
    };

    socket.on('orders:new', handleNewOrder);
    socket.on('orders:updated', handleOrderUpdated);

    return () => {
      detachPanel();
      socket.off('orders:new', handleNewOrder);
      socket.off('orders:updated', handleOrderUpdated);
    };
  }, [user, token, restaurantName, isOrdersPage, ensurePermission]);

  return null;
}

