import axios from 'axios';
import { getOfflineOrders, markOrderAsSynced } from '../database/orders';
import { getOfflineReturns, markReturnAsSynced } from '../database/returns';
import {
  getOfflineShiftActions,
  markShiftActionSynced,
  markShiftActionError,
  resolveServerShiftIdForKey,
} from '../database/posShifts';
import { getApiConfig } from '../config/api';
import { loadUserSession } from '../database/preferences';

function tryJwtIssuedAt(token: string): number | null {
  const parts = token.split('.');
  if (parts.length < 2) return null;
  try {
    const payload = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const json = Buffer.from(payload, 'base64').toString('utf8');
    const obj = JSON.parse(json) as { iat?: number };
    return typeof obj.iat === 'number' && Number.isFinite(obj.iat) ? obj.iat : null;
  } catch {
    return null;
  }
}

/** بدون override: بین توکن نشست و توکن ذخیره‌شده روی سفارش، جدیدتر (iat بیشتر) را برگزین. */
function resolveAuthTokenWithoutOverride(sessionTok: string, orderTok: string): string {
  const s = sessionTok.trim();
  const o = orderTok.trim();
  if (!s) return o;
  if (!o) return s;
  const iatS = tryJwtIssuedAt(s);
  const iatO = tryJwtIssuedAt(o);
  if (iatS != null && iatO != null) {
    return iatS >= iatO ? s : o;
  }
  return s;
}

async function concurrentMap<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = [];
  for (let i = 0; i < items.length; i += limit) {
    const chunk = items.slice(i, i + limit);
    const chunkResults = await Promise.all(chunk.map(fn));
    results.push(...chunkResults);
  }
  return results;
}

export async function syncOfflineOrders(tokenOverride?: string) {
  const offlineOrders = await getOfflineOrders();
  const results = { success: 0, failed: 0, errors: [] as string[] };
  if (offlineOrders.length === 0) return results;

  const apiConfig = getApiConfig();
  const defaultBaseURL = apiConfig.baseURL;
  // بار session یک‌بار برای همه سفارش‌ها
  const currentSession = await loadUserSession();
  const latestSessionToken = typeof currentSession?.token === 'string' ? currentSession.token.trim() : '';
  const override = typeof tokenOverride === 'string' ? tokenOverride.trim() : '';

  type ItemResult = { success: number; failed: number; errors: string[] };

  const itemResults = await concurrentMap(offlineOrders, 3, async (order): Promise<ItemResult> => {
    if (!order.id) return { success: 0, failed: 0, errors: [] };

    const items = order.orderData?.items;
    if (!Array.isArray(items) || items.length === 0) {
      await markOrderAsSynced(order.id);
      return { success: 0, failed: 1, errors: [`سفارش ${order.id}: رد شد (بدون آیتم)`] };
    }

    try {
      // اگر sync با توکن زنده‌ی رندرر انجام می‌شود، باید به همان سرور فعلی بزنیم
      // نه baseURL قدیمی ذخیره‌شده روی سفارش آفلاین.
      const targetBaseURL = override.length > 0 ? defaultBaseURL : (order.baseURL || defaultBaseURL);
      const orderTok = typeof order.token === 'string' ? order.token.trim() : '';
      const authToken = override || resolveAuthTokenWithoutOverride(latestSessionToken, orderTok);

      const response = await axios.post(`${targetBaseURL}/orders`, order.orderData, {
        headers: {
          ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
          'Content-Type': 'application/json',
        },
      });

      if (response.data) {
        await markOrderAsSynced(order.id);
        return { success: 1, failed: 0, errors: [] };
      }
      return { success: 0, failed: 1, errors: [`سفارش ${order.id}: پاسخ خالی از سرور`] };
    } catch (error: any) {
      const status = error?.response?.status;
      const errorMsg = status === 401
        ? `سفارش ${order.id}: Unauthorized (نشست منقضی یا نامعتبر — دوباره وارد شوید)`
        : `Order ${order.id}: ${error.response?.data?.message || error.message || 'Unknown error'}`;
      console.error(`Failed to sync order ${order.id}:`, error);
      return { success: 0, failed: 1, errors: [errorMsg] };
    }
  });

  for (const r of itemResults) {
    results.success += r.success;
    results.failed += r.failed;
    results.errors.push(...r.errors);
  }
  return results;
}

/**
 * Sync صف آفلاین اکشن‌های شیفت صندوق (باز/بستن). برخلاف syncOfflineOrders/Returns،
 * این‌جا یک وابستگی ترتیبی واقعی وجود دارد: «بستن» به شناسهٔ سرورِ همان شیفت نیاز
 * دارد که فقط بعد از sync موفقِ «باز کردن» مشخص می‌شود. پس عمداً در دو مرحله
 * (اول همهٔ open ها، بعد فقط close هایی که serverShiftId دارند) با concurrency
 * سقف ۳ در هر مرحله اجرا می‌شود — این وابستگی فقط داخل همین صف است و ربطی به
 * ترتیب catalog-before-accounting در src/services/syncCoordinator.ts ندارد (آن
 * فایل دست‌نخورده مانده).
 */
export async function syncOfflinePosShifts(tokenOverride?: string) {
  const actions = await getOfflineShiftActions();
  const results = { success: 0, failed: 0, errors: [] as string[] };
  if (actions.length === 0) return results;

  const apiConfig = getApiConfig();
  const defaultBaseURL = apiConfig.baseURL;
  const currentSession = await loadUserSession();
  const latestSessionToken = typeof currentSession?.token === 'string' ? currentSession.token.trim() : '';
  const override = typeof tokenOverride === 'string' ? tokenOverride.trim() : '';

  type ItemResult = { success: number; failed: number; errors: string[] };

  const opens = actions.filter((a) => a.type === 'open');
  const closes = actions.filter((a) => a.type === 'close');

  const openResults = await concurrentMap(opens, 3, async (action): Promise<ItemResult> => {
    try {
      const targetBaseURL = override.length > 0 ? defaultBaseURL : (action.baseURL || defaultBaseURL);
      const actionTok = typeof action.token === 'string' ? action.token.trim() : '';
      const authToken = override || resolveAuthTokenWithoutOverride(latestSessionToken, actionTok);

      const response = await axios.post(
        `${targetBaseURL}/pos-shifts/open`,
        { ...action.payload, restaurantId: action.restaurantId, clientShiftKey: action.clientShiftKey },
        {
          headers: {
            ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
            'Content-Type': 'application/json',
          },
        },
      );
      const serverShiftId = response.data?.id;
      await markShiftActionSynced(action.id, serverShiftId);
      if (typeof serverShiftId === 'number') {
        await resolveServerShiftIdForKey(action.clientShiftKey, serverShiftId);
      }
      return { success: 1, failed: 0, errors: [] };
    } catch (error: any) {
      const status = error?.response?.status;
      const errorMsg = status === 401
        ? `باز کردن شیفت ${action.id}: Unauthorized (نشست منقضی یا نامعتبر — دوباره وارد شوید)`
        : `باز کردن شیفت ${action.id}: ${error.response?.data?.message || error.message || 'خطای ناشناخته'}`;
      await markShiftActionError(action.id, errorMsg);
      console.error(`Failed to sync pos-shift open ${action.id}:`, error);
      return { success: 0, failed: 1, errors: [errorMsg] };
    }
  });

  const closeResults = await concurrentMap(closes, 3, async (action): Promise<ItemResult> => {
    // شیفت مربوطه هنوز sync نشده (بدون شناسهٔ سرور) — منتظر نوبت بعدی sync می‌ماند،
    // نه موفق و نه شکست‌خورده.
    if (action.serverShiftId == null) {
      return { success: 0, failed: 0, errors: [] };
    }
    try {
      const targetBaseURL = override.length > 0 ? defaultBaseURL : (action.baseURL || defaultBaseURL);
      const actionTok = typeof action.token === 'string' ? action.token.trim() : '';
      const authToken = override || resolveAuthTokenWithoutOverride(latestSessionToken, actionTok);

      await axios.post(
        `${targetBaseURL}/pos-shifts/${action.serverShiftId}/close`,
        action.payload,
        {
          params: { restaurantId: action.restaurantId },
          headers: {
            ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
            'Content-Type': 'application/json',
          },
        },
      );
      await markShiftActionSynced(action.id);
      return { success: 1, failed: 0, errors: [] };
    } catch (error: any) {
      const status = error?.response?.status;
      const errorMsg = status === 401
        ? `بستن شیفت ${action.id}: Unauthorized (نشست منقضی یا نامعتبر — دوباره وارد شوید)`
        : `بستن شیفت ${action.id}: ${error.response?.data?.message || error.message || 'خطای ناشناخته'}`;
      await markShiftActionError(action.id, errorMsg);
      console.error(`Failed to sync pos-shift close ${action.id}:`, error);
      return { success: 0, failed: 1, errors: [errorMsg] };
    }
  });

  for (const r of [...openResults, ...closeResults]) {
    results.success += r.success;
    results.failed += r.failed;
    results.errors.push(...r.errors);
  }
  return results;
}

export async function syncOfflineReturns(tokenOverride?: string) {
  const offlineReturns = await getOfflineReturns();
  const results = { success: 0, failed: 0, errors: [] as string[] };
  if (offlineReturns.length === 0) return results;

  const apiConfig = getApiConfig();
  const defaultBaseURL = apiConfig.baseURL;
  // بار session یک‌بار برای همه مرجوعی‌ها
  const currentSession = await loadUserSession();
  const latestSessionToken = typeof currentSession?.token === 'string' ? currentSession.token.trim() : '';
  const override = typeof tokenOverride === 'string' ? tokenOverride.trim() : '';

  type ItemResult = { success: number; failed: number; errors: string[] };

  const itemResults = await concurrentMap(offlineReturns, 3, async (ret): Promise<ItemResult> => {
    if (!ret.id) return { success: 0, failed: 0, errors: [] };

    const items = ret.returnData?.items;
    if (!Array.isArray(items) || items.length === 0) {
      await markReturnAsSynced(ret.id);
      return { success: 0, failed: 1, errors: [`مرجوعی ${ret.id}: رد شد (بدون آیتم)`] };
    }

    try {
      const targetBaseURL = override.length > 0 ? defaultBaseURL : (ret.baseURL || defaultBaseURL);
      const retTok = typeof ret.token === 'string' ? ret.token.trim() : '';
      const authToken = override || resolveAuthTokenWithoutOverride(latestSessionToken, retTok);

      const response = await axios.post(`${targetBaseURL}/order-returns`, ret.returnData, {
        headers: {
          ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
          'Content-Type': 'application/json',
        },
      });

      if (response.data) {
        await markReturnAsSynced(ret.id);
        return { success: 1, failed: 0, errors: [] };
      }
      return { success: 0, failed: 1, errors: [`مرجوعی ${ret.id}: پاسخ خالی از سرور`] };
    } catch (error: any) {
      const status = error?.response?.status;
      const errorMsg = status === 401
        ? `مرجوعی ${ret.id}: Unauthorized (نشست منقضی یا نامعتبر — دوباره وارد شوید)`
        : `مرجوعی ${ret.id}: ${error.response?.data?.message || error.message || 'Unknown error'}`;
      console.error(`Failed to sync return ${ret.id}:`, error);
      return { success: 0, failed: 1, errors: [errorMsg] };
    }
  });

  for (const r of itemResults) {
    results.success += r.success;
    results.failed += r.failed;
    results.errors.push(...r.errors);
  }
  return results;
}
