import type { NavigateFunction } from 'react-router-dom';
import type { CartItem } from '../../../store/orderStore';
import type { Dispatch, SetStateAction } from 'react';
import type { OrderModalState } from '../components/OrderModal';
import type { User } from '../../../store/authStore';
import { useEffect } from 'react';
import { useOrderNavStore } from '../../../store/orderNavStore';
import { fetchOrders } from '../../../services/api';
import { toast } from '../../../utils/toast';

export interface useOrderPageEffectsArgs {
  setModalState: Dispatch<SetStateAction<OrderModalState>>;
  user: User | null;
  scaleModalOpen: boolean;
  setScaleWeight: Dispatch<SetStateAction<number | null>>;
  setScaleReading: Dispatch<SetStateAction<boolean>>;
  setScaleError: Dispatch<SetStateAction<string>>;
  setSearchTerm: Dispatch<SetStateAction<string>>;
  modalState: OrderModalState;
  cart: CartItem[];
  token: string | null;
  editingOrderId: number | null;
  navigate: NavigateFunction;
  resetSession: (options?: { skipConfirm?: boolean }) => void;
  orderEditError: string;
  setOrderEditError: Dispatch<SetStateAction<string>>;
}

export function useOrderPageEffects({
  setModalState,
  user,
  scaleModalOpen,
  setScaleWeight,
  setScaleReading,
  setScaleError,
  setSearchTerm,
  modalState,
  cart,
  token,
  editingOrderId,
  navigate,
  resetSession,
  orderEditError,
  setOrderEditError,
}: useOrderPageEffectsArgs) {
  // Load card terminal profiles
  useEffect(() => {
    const load = async () => {
      try {
        const cfg = await window.electronAPI?.getCardTerminalConfig?.();
        const profiles = (cfg?.profiles || []).map((p: any) => ({
          id: String(p.id),
          name: String(p.name || 'کارتخوان'),
        }));
        setModalState((s) => ({
          ...s,
          cardTerminalProfiles: profiles,
          selectedCardTerminalId: String(cfg?.defaultProfileId || profiles[0]?.id || ''),
        }));
      } catch {
        setModalState((s) => ({ ...s, cardTerminalProfiles: [], selectedCardTerminalId: '' }));
      }
    };
    load();
  }, []);

  // Load cash boxes
  useEffect(() => {
    const load = async () => {
      try {
        const { accountingDb } = await import('../../../services/accountingLocalDb');
        const rid = user?.restaurants?.[0]?.id;
        if (!rid) return;
        const accounts = await accountingDb.cashBankAccounts
          .where('restaurantId')
          .equals(Number(rid))
          .filter((a: any) => a.accountType === 'cashbox' || a.accountType === 'cash')
          .toArray();
        setModalState((s) => ({
          ...s,
          cashBoxAccounts: accounts || [],
          selectedCashBoxId: accounts?.[0]?.id ?? null,
          selectedCashBoxName: accounts?.[0]?.name || 'صندوق',
        }));
      } catch {
        setModalState((s) => ({ ...s, cashBoxAccounts: [] }));
      }
    };
    load();
  }, [user?.restaurants]);

  // Scale weight listener
  useEffect(() => {
    if (!scaleModalOpen || !window.electronAPI?.onScaleWeightUpdate) return;
    const unsub = window.electronAPI.onScaleWeightUpdate((weight) => {
      setScaleWeight(weight);
      setScaleReading(false);
      setScaleError('');
    });
    return () => unsub?.();
  }, [scaleModalOpen]);

  // Keyboard shortcuts
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setSearchTerm('');
      if (e.key === 'Enter' && !modalState.isOpen && cart.length > 0) {
        const target = e.target as HTMLElement;
        if (!target.closest('input') && !target.closest('textarea') && !target.closest('button')) {
          setModalState((s) => ({ ...s, isOpen: true }));
          e.preventDefault();
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [modalState.isOpen, cart.length]);

  // اگر کاربر مستقیم وارد صفحهٔ ثبت سفارش شده (بدون اینکه قبلاً از صفحهٔ لیست سفارشات
  // بازدید کرده باشد)، useOrderNavStore هنوز خالی است — یک بار به‌صورت پس‌زمینه سفارش‌های
  // اخیر را می‌گیریم تا میانبر ← / → همین‌جا هم فعال باشد
  useEffect(() => {
    if (!token) return;
    if (useOrderNavStore.getState().orderIds.length > 0) return;
    let cancelled = false;
    const restaurantName = user?.restaurants?.[0]?.name;
    (async () => {
      try {
        const response = await fetchOrders(
          { page: 1, limit: 100, ...(restaurantName ? { restaurantName } : {}) },
          token,
        );
        if (cancelled) return;
        const data = Array.isArray(response)
          ? response
          : Array.isArray(response?.data)
            ? response.data
            : [];
        useOrderNavStore
          .getState()
          .setOrderIds(data.map((o: any) => o?.id).filter((id: any) => id != null));
      } catch {
        /* آفلاین یا خطای شبکه — میانبر پیمایش صرفاً غیرفعال می‌ماند */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token, user?.restaurants]);

  // پیمایش بین فاکتور قبلی/بعدی با ← / → — هم از صفحهٔ خالی «ثبت سفارش» (وقتی سبد خالی
  // است، تا سفارش تازهٔ در حال تکمیل گم نشود) و هم حین ویرایش یک سفارش. فهرست شناسه‌ها
  // از صفحهٔ لیست سفارشات در useOrderNavStore منتشر می‌شود چون رفتن به این صفحه
  // (/order?edit=) آن کامپوننت را از DOM خارج می‌کند و شنوندهٔ کیبوردش دیگر وجود ندارد
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
      const active = document.activeElement as HTMLElement | null;
      if (active?.closest('input, textarea, [contenteditable="true"]')) return;
      if (active?.closest('[role="dialog"]')) return;
      if (active?.closest('[data-slot="select"]')) return;
      if (editingOrderId == null && cart.length > 0) return;
      const orderIds = useOrderNavStore.getState().orderIds;
      if (orderIds.length === 0) return;
      const currentIndex = editingOrderId != null ? orderIds.indexOf(editingOrderId) : -1;
      const max = orderIds.length - 1;
      const nextIndex =
        e.key === 'ArrowRight' ? Math.min(currentIndex + 1, max) : Math.max(currentIndex - 1, 0);
      if (currentIndex !== -1 && nextIndex === currentIndex) return;
      e.preventDefault();
      navigate(`/order?edit=${orderIds[nextIndex]}`);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [editingOrderId, cart.length, navigate]);

  useEffect(() => {
    const onShortcut = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.shiftKey && e.key === 'Backspace') {
        e.preventDefault();
        resetSession();
      }
    };
    window.addEventListener('keydown', onShortcut);
    return () => window.removeEventListener('keydown', onShortcut);
  });

  useEffect(() => {
    const onReset = () => resetSession({ skipConfirm: true });
    window.addEventListener('menus-electron:reset-order-session', onReset);
    return () => window.removeEventListener('menus-electron:reset-order-session', onReset);
  });

  // Error toasts
  useEffect(() => {
    if (orderEditError) {
      toast.error(orderEditError);
      setOrderEditError('');
    }
  }, [orderEditError]);
}
