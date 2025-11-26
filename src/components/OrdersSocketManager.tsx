import { useCallback, useEffect, useMemo, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { connectOrdersSocket, disconnectOrdersSocket } from '../services/ordersSocket';
import { useAuthStore } from '../store/authStore';

const formatPrice = (value?: number) => {
  if (typeof value !== 'number') {
    return '';
  }
  return new Intl.NumberFormat('fa-IR').format(value) + ' تومان';
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
  const isOrdersPage = location.pathname === '/orders';
  const ensurePermission = useNotificationPermission();
  const restaurantKeyRef = useRef<string | null>(null);

  useEffect(() => {
    if (isOrdersPage || !token || !restaurantName) {
      disconnectOrdersSocket();
      restaurantKeyRef.current = null;
      return;
    }

    const socket = connectOrdersSocket({ token, restaurantName });
    if (!socket) {
      return;
    }

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
      socket.off('orders:new', handleNewOrder);
      socket.off('orders:updated', handleOrderUpdated);
    };
  }, [token, restaurantName, isOrdersPage, ensurePermission]);

  return null;
}

