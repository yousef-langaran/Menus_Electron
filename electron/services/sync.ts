import axios from 'axios';
import { getOfflineOrders, markOrderAsSynced } from '../database/orders';
import { getOfflineReturns, markReturnAsSynced } from '../database/returns';
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
