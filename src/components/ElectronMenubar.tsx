import { useCallback, useEffect, useMemo } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Button, Chip, Dropdown, Separator } from '@heroui/react';
import { useAuthStore } from '../store/authStore';
import { useCallerIdStore } from '../store/callerIdStore';
import { useSyncStore } from '../store/syncStore';
import {
  canAccessRoute,
  hasOrderRegisterAccess,
  type ElectronUser,
} from '../lib/electronPermissions';

type NavLeaf = { path: string; label: string; visible: (u: ElectronUser) => boolean };

// تنها منبع وضعیت آنلاین/آفلاین در کل اپ — نتیجه در useSyncStore نوشته می‌شود
// تا سایر بخش‌ها (مثل Suppliers.tsx) هم همین مقدار را بخوانند و دچار ناهماهنگی نشوند.
function useOnlineFlag() {
  const online = useSyncStore((s) => s.isOnline);
  const setOnline = useSyncStore((s) => s.setOnline);

  const refresh = useCallback(async () => {
    if (typeof window !== 'undefined' && window.electronAPI?.checkOnline) {
      try {
        setOnline(await window.electronAPI.checkOnline());
        return;
      } catch {
        /* fall through */
      }
    }
    setOnline(typeof navigator !== 'undefined' ? navigator.onLine : true);
  }, [setOnline]);

  useEffect(() => {
    void refresh();
    const t = window.setInterval(() => void refresh(), 8000);
    const on = () => void refresh();
    window.addEventListener('online', on);
    window.addEventListener('offline', on);
    return () => {
      window.clearInterval(t);
      window.removeEventListener('online', on);
      window.removeEventListener('offline', on);
    };
  }, [refresh]);

  return online;
}

function pathIsActive(pathname: string, target: string): boolean {
  return pathname === target;
}

function salesGroupActive(pathname: string): boolean {
  return pathname === '/order' || pathname === '/orders' || pathname === '/order-returns';
}

function catalogGroupActive(pathname: string): boolean {
  return pathname === '/products' || pathname === '/categories';
}

function accountingGroupActive(pathname: string): boolean {
  return pathname === '/accounting' || pathname.startsWith('/accounting/');
}

function serviceJobsActive(pathname: string): boolean {
  return pathname === '/service-jobs';
}

export function ElectronMenubar() {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const online = useOnlineFlag();
  const callHistoryCount = useCallerIdStore((s) => s.callHistory.length);
  const callerIdEnabled = useCallerIdStore((s) => s.settings?.enabled ?? false);

  const salesItems: NavLeaf[] = useMemo(
    () => [
      { path: '/order', label: 'ثبت سفارش', visible: (u) => hasOrderRegisterAccess(u) },
      {
        path: '/orders',
        label: 'لیست سفارشات',
        visible: (u) => canAccessRoute(u, '/orders'),
      },
      {
        path: '/order-returns',
        label: 'مرجوعی‌ها',
        visible: (u) => canAccessRoute(u, '/orders'),
      },
    ],
    [],
  );

  const catalogItems: NavLeaf[] = useMemo(
    () => [
      { path: '/products', label: 'مدیریت محصولات', visible: (u) => canAccessRoute(u, '/products') },
      { path: '/categories', label: 'مدیریت دسته‌بندی‌ها', visible: (u) => canAccessRoute(u, '/categories') },
    ],
    [],
  );

  const accountingItems: NavLeaf[] = useMemo(
    () => [
      { path: '/accounting', label: 'داشبورد حسابداری', visible: (u) => canAccessRoute(u, '/accounting') },
      { path: '/accounting/raw-materials', label: 'مواد اولیه', visible: (u) => canAccessRoute(u, '/accounting/raw-materials') },
      { path: '/accounting/raw-material-categories', label: 'دسته‌بندی مواد اولیه', visible: (u) => canAccessRoute(u, '/accounting/raw-material-categories') },
      { path: '/accounting/suppliers', label: 'تأمین‌کنندگان', visible: (u) => canAccessRoute(u, '/accounting/suppliers') },
      { path: '/accounting/purchase-drafts', label: 'فاکتورهای خرید', visible: (u) => canAccessRoute(u, '/accounting/purchase-drafts') },
      { path: '/accounting/purchase-returns', label: 'برگشت از خرید', visible: (u) => canAccessRoute(u, '/accounting/purchase-returns') },
      { path: '/accounting/kardex', label: 'گزارش کاردکس کالا', visible: (u) => canAccessRoute(u, '/accounting/kardex') },
      { path: '/accounting/expenses', label: 'ثبت هزینه', visible: (u) => canAccessRoute(u, '/accounting/expenses') },
      { path: '/accounting/cash-accounts', label: 'صندوق و حساب‌ها', visible: (u) => canAccessRoute(u, '/accounting/cash-accounts') },
    ],
    [],
  );

  const systemItems: NavLeaf[] = useMemo(
    () => [
      { path: '/settings', label: 'تنظیمات و سخت‌افزار', visible: (u) => canAccessRoute(u, '/settings') },
      { path: '/card-terminals', label: 'مدیریت کارتخوان‌ها', visible: (u) => canAccessRoute(u, '/card-terminals') },
      { path: '/call-history', label: 'تاریخچه تماس‌ها', visible: (u) => callerIdEnabled && canAccessRoute(u, '/call-history') },
    ],
    [callerIdEnabled],
  );

  const filterVisible = (items: NavLeaf[]) => items.filter((i) => i.visible(user));

  const salesVis = filterVisible(salesItems);
  const catalogVis = filterVisible(catalogItems);
  const accountingVis = filterVisible(accountingItems);
  const systemVis = filterVisible(systemItems);
  const showServiceJobs = canAccessRoute(user, '/service-jobs');
  const systemHwVis = systemVis.filter((i) => i.path !== '/call-history');
  const systemCallVis = systemVis.filter((i) => i.path === '/call-history');

  const userLabel =
    [user?.firstName, user?.lastName].filter(Boolean).join(' ').trim() ||
    user?.mobile ||
    'کاربر';

  const restaurantLabel = user?.restaurants?.[0]?.name_fa || user?.restaurants?.[0]?.name || '';

  const onMenuAction = (key: string | number) => {
    const path = String(key);
    if (path.startsWith('/')) navigate(path);
  };

  const accountingDash = accountingVis.filter((i) => i.path === '/accounting');
  const accountingRest = accountingVis.filter((i) => i.path !== '/accounting');

  const menuBtnClass = (active: boolean) =>
    `min-h-9 h-9 px-3 text-sm font-medium ${active ? 'bg-default-200 dark:bg-default-100/20' : ''}`;

  return (
    <header
      className="shrink-0 z-40 flex flex-wrap items-center gap-1 border-b border-default-300 bg-[#e8e8e8] px-2 py-1 shadow-sm dark:border-default-100 dark:bg-zinc-900"
      role="navigation"
      aria-label="منوی اصلی برنامه"
    >
      <div className="flex items-center gap-2 pe-2">
        <img
          src="./branding/secoin-frontend-logo.png"
          alt="سکه"
          className="h-7 w-auto ps-1"
        />
        <Chip
          size="sm"
          variant="soft"
          color={online ? 'success' : 'danger'}
          className="font-medium text-xs"
        >
          {online ? 'آنلاین' : 'آفلاین'}
        </Chip>
      </div>

      <Separator orientation="vertical" className="h-7 hidden sm:block" />

      {salesVis.length > 0 ? (
        <Dropdown.Root>
          <Dropdown.Trigger
            variant="ghost"
            size="sm"
            className={menuBtnClass(salesGroupActive(pathname))}
          >
            <span className="inline-flex items-center gap-1">
              سفارش و فروش
              <span className="text-[10px] opacity-60">▾</span>
            </span>
          </Dropdown.Trigger>
          <Dropdown.Popover>
            <Dropdown.Menu aria-label="سفارش و فروش" onAction={onMenuAction}>
              <Dropdown.Section title="سفارش">
                {salesVis.map((item) => (
                  <Dropdown.Item
                    key={item.path}
                    id={item.path}
                    textValue={item.label}
                    className={pathIsActive(pathname, item.path) ? 'bg-primary-50' : undefined}
                  >
                    {item.label}
                  </Dropdown.Item>
                ))}
              </Dropdown.Section>
            </Dropdown.Menu>
          </Dropdown.Popover>
        </Dropdown.Root>
      ) : null}

      {catalogVis.length > 0 ? (
        <Dropdown.Root>
          <Dropdown.Trigger variant="ghost" size="sm" className={menuBtnClass(catalogGroupActive(pathname))}>
            <span className="inline-flex items-center gap-1">
              کاتالوگ
              <span className="text-[10px] opacity-60">▾</span>
            </span>
          </Dropdown.Trigger>
          <Dropdown.Popover>
            <Dropdown.Menu aria-label="کاتالوگ" onAction={onMenuAction}>
              <Dropdown.Section title="محتوا">
                {catalogVis.map((item) => (
                  <Dropdown.Item
                    key={item.path}
                    id={item.path}
                    textValue={item.label}
                    className={pathIsActive(pathname, item.path) ? 'bg-primary-50' : undefined}
                  >
                    {item.label}
                  </Dropdown.Item>
                ))}
              </Dropdown.Section>
            </Dropdown.Menu>
          </Dropdown.Popover>
        </Dropdown.Root>
      ) : null}

      {accountingVis.length > 0 ? (
        <Dropdown.Root>
          <Dropdown.Trigger variant="ghost" size="sm" className={menuBtnClass(accountingGroupActive(pathname))}>
            <span className="inline-flex items-center gap-1">
              حسابداری
              <span className="text-[10px] opacity-60">▾</span>
            </span>
          </Dropdown.Trigger>
          <Dropdown.Popover>
            <Dropdown.Menu aria-label="حسابداری" className="max-h-[70vh] overflow-y-auto" onAction={onMenuAction}>
              {accountingDash.length > 0 ? (
                <Dropdown.Section title="کلیات">
                  {accountingDash.map((item) => (
                    <Dropdown.Item
                      key={item.path}
                      id={item.path}
                      textValue={item.label}
                      className={pathIsActive(pathname, item.path) ? 'bg-primary-50' : undefined}
                    >
                      {item.label}
                    </Dropdown.Item>
                  ))}
                </Dropdown.Section>
              ) : null}
              {accountingRest.length > 0 ? (
                <Dropdown.Section title="ماژول‌ها">
                  {accountingRest.map((item) => (
                    <Dropdown.Item
                      key={item.path}
                      id={item.path}
                      textValue={item.label}
                      className={pathIsActive(pathname, item.path) ? 'bg-primary-50' : undefined}
                    >
                      {item.label}
                    </Dropdown.Item>
                  ))}
                </Dropdown.Section>
              ) : null}
            </Dropdown.Menu>
          </Dropdown.Popover>
        </Dropdown.Root>
      ) : null}

      {showServiceJobs ? (
        <Button
          variant="ghost"
          size="sm"
          onPress={() => navigate('/service-jobs')}
          className={menuBtnClass(serviceJobsActive(pathname))}
        >
          پرونده خدمات
        </Button>
      ) : null}

      {systemVis.length > 0 ? (
        <Dropdown.Root>
          <Dropdown.Trigger
            variant="ghost"
            size="sm"
            className={menuBtnClass(systemVis.some((i) => pathname === i.path || pathname.startsWith(i.path + '/')))}
          >
            <span className="inline-flex items-center gap-1">
              سیستم
              {callHistoryCount > 0 && (
                <span className="bg-red-500 text-white text-[10px] font-bold rounded-full min-w-[16px] h-[16px] flex items-center justify-center px-1 leading-none">
                  {callHistoryCount}
                </span>
              )}
              <span className="text-[10px] opacity-60">▾</span>
            </span>
          </Dropdown.Trigger>
          <Dropdown.Popover>
            <Dropdown.Menu aria-label="سیستم" onAction={onMenuAction}>
              {systemHwVis.length > 0 ? (
                <Dropdown.Section title="سخت‌افزار">
                  {systemHwVis.map((item) => (
                    <Dropdown.Item
                      key={item.path}
                      id={item.path}
                      textValue={item.label}
                      className={pathIsActive(pathname, item.path) ? 'bg-primary-50' : undefined}
                    >
                      {item.label}
                    </Dropdown.Item>
                  ))}
                </Dropdown.Section>
              ) : null}
              {systemCallVis.length > 0 ? (
                <Dropdown.Section title="تماس">
                  {systemCallVis.map((item) => (
                    <Dropdown.Item
                      key={item.path}
                      id={item.path}
                      textValue={item.label}
                      className={pathIsActive(pathname, item.path) ? 'bg-primary-50' : undefined}
                    >
                      {item.label}
                    </Dropdown.Item>
                  ))}
                </Dropdown.Section>
              ) : null}
            </Dropdown.Menu>
          </Dropdown.Popover>
        </Dropdown.Root>
      ) : null}

      <div className="flex-1 min-w-[8px]" />

      <div className="flex items-center gap-2 flex-wrap justify-end ms-auto">
        {restaurantLabel ? (
          <Chip color={'accent'} size="sm" variant={'soft'} className="max-w-[140px] truncate text-xs">
            <Chip.Label>{restaurantLabel}</Chip.Label>
          </Chip>
        ) : null}
        <Chip size="sm" variant="soft" color="default" className="max-w-[160px] truncate text-xs">
          {userLabel}
        </Chip>
        <Button
          size="sm"
          variant="danger-soft"
          className="min-h-9 h-9 font-medium"
          onPress={() => {
            void logout().then(() => navigate('/login', { replace: true }));
          }}
        >
          خروج
        </Button>
      </div>
    </header>
  );
}
