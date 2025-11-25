export async function saveOfflineOrder(orderData: any, token: string, baseURL?: string): Promise<number> {
  if (typeof window !== 'undefined' && window.electronAPI) {
    try {
      const result = await window.electronAPI.saveOfflineOrder(orderData, token, baseURL);
      if (result?.success && result.orderId) {
        return result.orderId;
      }
    } catch (error) {
      console.error('Failed to save offline order via electron API:', error);
    }
  }

  const fallbackId = Date.now();
  try {
    const orders = JSON.parse(localStorage.getItem('offlineOrders') || '[]');
    orders.push({
      id: fallbackId,
      orderData,
      token,
      createdAt: new Date().toISOString(),
      synced: false,
      baseURL,
    });
    localStorage.setItem('offlineOrders', JSON.stringify(orders));
  } catch (error) {
    console.error('Failed to save offline order (fallback):', error);
  }

  return fallbackId;
}

export async function getAllOrders() {
  if (typeof window !== 'undefined' && window.electronAPI) {
    try {
      return await window.electronAPI.getOfflineOrders();
    } catch (error) {
      console.error('Failed to get offline orders via electron API:', error);
    }
  }

  try {
    const orders = JSON.parse(localStorage.getItem('offlineOrders') || '[]');
    return orders;
  } catch (error) {
    console.error('Failed to get orders (fallback):', error);
    return [];
  }
}

