import axios from 'axios';
import { getOfflineOrders, markOrderAsSynced } from '../database/orders';
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

export async function syncOfflineOrders(tokenOverride?: string) {
  const offlineOrders = await getOfflineOrders();
  const results = {
    success: 0,
    failed: 0,
    errors: [] as string[],
  };

  if (offlineOrders.length === 0) {
    return results;
  }

  const apiConfig = getApiConfig();
  const defaultBaseURL = apiConfig.baseURL;

  for (const order of offlineOrders) {
    if (!order.id) continue;

    const items = order.orderData?.items;
    if (!Array.isArray(items) || items.length === 0) {
      await markOrderAsSynced(order.id);
      results.failed++;
      results.errors.push(`سفارش ${order.id}: رد شد (بدون آیتم)`);
      continue;
    }

    try {
      const targetBaseURL = order.baseURL || defaultBaseURL;
      const currentSession = await loadUserSession();
      const latestSessionToken =
        typeof currentSession?.token === 'string' ? currentSession.token.trim() : '';

      const override = typeof tokenOverride === 'string' ? tokenOverride.trim() : '';
      const orderTok = typeof order.token === 'string' ? order.token.trim() : '';

      const authToken = override
        ? override
        : resolveAuthTokenWithoutOverride(latestSessionToken, orderTok);

      const response = await axios.post(`${targetBaseURL}/orders`, order.orderData, {
        headers: {
          ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
          'Content-Type': 'application/json',
        },
      });

      if (response.data) {
        await markOrderAsSynced(order.id);
        results.success++;
      }
    } catch (error: any) {
      results.failed++;
      const status = error?.response?.status;
      if (status === 401) {
        results.errors.push(`سفارش ${order.id}: Unauthorized (نشست منقضی یا نامعتبر — دوباره وارد شوید)`);
      } else {
        const errorMsg = error.response?.data?.message || error.message || 'Unknown error';
        results.errors.push(`Order ${order.id}: ${errorMsg}`);
      }
      console.error(`Failed to sync order ${order.id}:`, error);
    }
  }

  return results;
}
