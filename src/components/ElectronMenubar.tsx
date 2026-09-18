import { useCallback, useEffect, useMemo } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Button, Chip, Dropdown, Separator } from '@heroui/react';
import { ShoppingCart, LayoutGrid, Wallet, ClipboardList, SlidersHorizontal, ChevronDown, LogOut, UserRound } from 'lucide-react';
import { useAuthStore } from '../store/authStore';
import { useCallerIdStore } from '../store/callerIdStore';
import { useSyncStore } from '../store/syncStore';
import {
  canAccessRoute,
  hasOrderRegisterAccess,
  type ElectronUser,
} from '../lib/electronPermissions';
import { useShortcutsHelpStore } from '../store/shortcutsHelpStore';
import { shortcutForPath } from '../constants/shortcuts';

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

const SHORTCUTS_HELP_KEY = '__shortcuts_help__';

function pathIsActive(pathname: string, target: string): boolean {
  return pathname === target;
}

/** برچسب آیتم منو + میانبر کیبورد صفحه (اگر موجود باشد) در سمت مقابل */
function NavItemLabel({ item }: { item: NavLeaf }) {
  const shortcut = shortcutForPath(item.path);
  return (
    <span className="flex items-center justify-between gap-4 w-full">
      <span>{item.label}</span>
      {shortcut ? (
        <span className="text-[10px] font-mono text-muted border border-border-secondary rounded px-1 py-0.5">
          {shortcut}
        </span>
      ) : null}
    </span>
  );
}

function salesGroupActive(pathname: string): boolean {
  return (
    pathname === '/order' ||
    pathname === '/orders' ||
    pathname === '/order-returns' ||
    pathname === '/kds' ||
    pathname === '/waiter-calls' ||
    pathname === '/pos-shift'
  );
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
  const openShortcutsHelp = useShortcutsHelpStore((s) => s.open);

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
      {
        path: '/kds',
        label: 'نمایشگر آشپزخانه',
        visible: (u) => canAccessRoute(u, '/kds'),
      },
      {
        path: '/waiter-calls',
        label: 'فراخوان گارسون',
        visible: (u) => canAccessRoute(u, '/waiter-calls'),
      },
      {
        path: '/pos-shift',
        label: 'شیفت صندوق',
        visible: (u) => canAccessRoute(u, '/pos-shift'),
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
    if (path === SHORTCUTS_HELP_KEY) { openShortcutsHelp(); return; }
    if (path.startsWith('/')) navigate(path);
  };

  const accountingDash = accountingVis.filter((i) => i.path === '/accounting');
  const accountingRest = accountingVis.filter((i) => i.path !== '/accounting');

  const menuBtnClass = (active: boolean) =>
    `min-h-9 h-9 px-3 rounded-lg text-sm font-medium gap-1.5 ${active ? 'bg-accent-soft text-accent-soft-foreground' : 'text-foreground/80 hover:bg-default-soft'}`;

  return (
    <header
      className="shrink-0 z-40 flex flex-wrap items-center gap-1 border-b border-border bg-surface px-3 py-1.5 shadow-sm"
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
            <span className="inline-flex items-center gap-1.5">
              <ShoppingCart className="h-4 w-4" aria-hidden />
              سفارش و فروش
              <ChevronDown className="h-3 w-3 opacity-60" aria-hidden />
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
                    className={pathIsActive(pathname, item.path) ? 'bg-accent-soft' : undefined}
                  >
                    <NavItemLabel item={item} />
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
            <span className="inline-flex items-center gap-1.5">
              <LayoutGrid className="h-4 w-4" aria-hidden />
              کاتالوگ
              <ChevronDown className="h-3 w-3 opacity-60" aria-hidden />
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
                    className={pathIsActive(pathname, item.path) ? 'bg-accent-soft' : undefined}
                  >
                    <NavItemLabel item={item} />
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
            <span className="inline-flex items-center gap-1.5">
              <Wallet className="h-4 w-4" aria-hidden />
              حسابداری
              <ChevronDown className="h-3 w-3 opacity-60" aria-hidden />
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
                      className={pathIsActive(pathname, item.path) ? 'bg-accent-soft' : undefined}
                    >
                      <NavItemLabel item={item} />
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
                      className={pathIsActive(pathname, item.path) ? 'bg-accent-soft' : undefined}
                    >
                      <NavItemLabel item={item} />
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
          <span className="inline-flex items-center gap-1.5">
            <ClipboardList className="h-4 w-4" aria-hidden />
            پرونده خدمات
          </span>
        </Button>
      ) : null}

      {systemVis.length > 0 ? (
        <Dropdown.Root>
          <Dropdown.Trigger
            variant="ghost"
            size="sm"
            className={menuBtnClass(systemVis.some((i) => pathname === i.path || pathname.startsWith(i.path + '/')))}
          >
            <span className="inline-flex items-center gap-1.5">
              <SlidersHorizontal className="h-4 w-4" aria-hidden />
              سیستم
              {callHistoryCount > 0 && (
                <span className="bg-danger text-danger-foreground text-[10px] font-bold rounded-full min-w-[16px] h-[16px] flex items-center justify-center px-1 leading-none">
                  {callHistoryCount}
                </span>
              )}
              <ChevronDown className="h-3 w-3 opacity-60" aria-hidden />
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
                      className={pathIsActive(pathname, item.path) ? 'bg-accent-soft' : undefined}
                    >
                      <NavItemLabel item={item} />
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
                      className={pathIsActive(pathname, item.path) ? 'bg-accent-soft' : undefined}
                    >
                      <NavItemLabel item={item} />
                    </Dropdown.Item>
                  ))}
                </Dropdown.Section>
              ) : null}
              <Dropdown.Section title="راهنما">
                <Dropdown.Item id={SHORTCUTS_HELP_KEY} textValue="راهنمای میانبرها">
                  <span className="flex items-center justify-between gap-4 w-full">
                    <span>راهنمای میانبرها</span>
                    <span className="text-[10px] font-mono text-muted border border-border-secondary rounded px-1 py-0.5">
                      F1
                    </span>
                  </span>
                </Dropdown.Item>
              </Dropdown.Section>
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
          <span className="inline-flex items-center gap-1">
            <UserRound className="h-3.5 w-3.5" aria-hidden />
            {userLabel}
          </span>
        </Chip>
        <Button
          size="sm"
          variant="danger-soft"
          className="min-h-9 h-9 rounded-lg font-medium gap-1.5"
          onPress={() => {
            void logout().then(() => navigate('/login', { replace: true }));
          }}
        >
          <LogOut className="h-4 w-4" aria-hidden />
          خروج
        </Button>
      </div>
    </header>
  );
}
