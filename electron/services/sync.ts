import axios from 'axios';
import { getOfflineOrders, markOrderAsSynced } from '../database/orders';
import { getApiConfig } from '../config/api';

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
  const defaultBaseURL = apiConfig.baseURL || 'https://apimenu.promal.ir/api/v1';

  for (const order of offlineOrders) {
    if (!order.id) continue;
    
    try {
      const targetBaseURL = order.baseURL || defaultBaseURL;
      const authToken = tokenOverride || order.token;
      const response = await axios.post(
        `${targetBaseURL}/orders`,
        order.orderData,
        {
          headers: {
            ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
            'Content-Type': 'application/json',
          },
        }
      );

      if (response.data) {
        await markOrderAsSynced(order.id);
        results.success++;
      }
    } catch (error: any) {
      results.failed++;
      const errorMsg = error.response?.data?.message || error.message || 'Unknown error';
      results.errors.push(`Order ${order.id}: ${errorMsg}`);
      console.error(`Failed to sync order ${order.id}:`, error);
    }
  }

  return results;
}

