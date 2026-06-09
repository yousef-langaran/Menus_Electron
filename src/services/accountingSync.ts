import {
  accountingDb,
  getPendingPurchaseInvoiceDrafts,
  getPurchaseInvoiceItemsByInvoiceId,
  getPendingAccountingOperations,
  getPendingPurchaseReturnDrafts,
  getSyncMeta,
  markPurchaseInvoiceSyncState,
  markPurchaseReturnSyncState,
  setSyncMeta,
  updateOperationSyncStatus,
  upsertPulledEntities,
  upsertPulledExpenseCategories,
  upsertPulledRawMaterialCategories,
  upsertPulledInvoices,
  upsertPulledInvoiceItems,
  upsertPulledCheques,
  upsertPulledReceivables,
  upsertPulledWarehouses,
  upsertPulledWarehouseTransfers,
  upsertPulledWarehouseStocks,
  upsertPulledPurchaseReturns,
  upsertPulledPurchaseReturnItems,
  getPendingCashTransactions,
  markCashTransactionsSynced,
} from './accountingLocalDb';
import {
  createPurchaseInvoiceAccounting,
  createPurchaseReturn,
  listExpenseCategories,
  listRawMaterialCategories,
  syncAccountingPull,
  syncAccountingPush,
} from './api';

function resolveOnlineStatus(): Promise<boolean> {
  if (typeof window !== 'undefined' && window.electronAPI?.checkOnline) {
    return window.electronAPI.checkOnline();
  }
  return Promise.resolve(typeof navigator !== 'undefined' ? navigator.onLine : true);
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

export async function getAccountingQueueStats(restaurantId: number) {
  let pendingOps = 0;
  let failedOps = 0;
  try {
    pendingOps = await accountingDb.syncOperations
      .where('[restaurantId+status]')
      .anyOf([
        [restaurantId, 'pending'],
        [restaurantId, 'failed'],
      ])
      .count();

    failedOps = await accountingDb.syncOperations
      .where('[restaurantId+status]')
      .equals([restaurantId, 'failed'])
      .count();
  } catch {
    // Fallback for legacy IndexedDB schemas missing compound index.
    const rows = await accountingDb.syncOperations.toArray();
    pendingOps = rows.filter(
      (row) =>
        row.restaurantId === restaurantId &&
        (row.status === 'pending' || row.status === 'failed'),
    ).length;
    failedOps = rows.filter(
      (row) => row.restaurantId === restaurantId && row.status === 'failed',
    ).length;
  }

  return { pendingOps, failedOps };
}

export async function runAccountingSync(args: {
  restaurantId: number;
  token: string;
}): Promise<{
  isOnline: boolean;
  pushed: number;
  pushFailed: number;
  pulled: number;
  syncedAt: string | null;
  draftPurchaseSynced: number;
}> {
  const { restaurantId, token } = args;
  const isOnline = await resolveOnlineStatus();
  if (!isOnline) {
    return {
      isOnline: false,
      pushed: 0,
      pushFailed: 0,
      pulled: 0,
      syncedAt: null,
      draftPurchaseSynced: 0,
    };
  }

  const MAX_RETRY = 5;
  const allPendingOps = await getPendingAccountingOperations(restaurantId, 200);
  // عملیاتی که بیش از MAX_RETRY بار تلاش شده و همچنان failed است را کنار بگذار
  const pendingOps = allPendingOps.filter((op) => Number(op.retryCount || 0) <= MAX_RETRY);
  let pushed = 0;
  let pushFailed = 0;
  let draftPurchaseSynced = 0;

  // Push entity operations (suppliers, materials, final products, etc.) FIRST so that
  // the server has them before any purchase invoice draft references their IDs.
  if (pendingOps.length > 0) {
    for (const op of pendingOps) {
      if (!op.id) continue;
      await updateOperationSyncStatus(op.id, 'syncing');
    }

    const pushResult = await syncAccountingPush(
      restaurantId,
      pendingOps.map((op) => ({
        localOpId: op.localOpId,
        entityType: op.entityType,
        operationType: op.operationType,
        entityId: op.entityId,
        payload: op.payload,
        version: op.version,
        clientUpdatedAt: op.clientUpdatedAt,
      })),
      token,
    );

    for (const item of pushResult.results || []) {
      const local = pendingOps.find((x) => x.localOpId === item.localOpId);
      if (!local?.id) continue;
      if (item.status === 'synced') {
        pushed += 1;
        await updateOperationSyncStatus(local.id, 'synced', { errorMessage: undefined });
      } else {
        pushFailed += 1;
        await updateOperationSyncStatus(local.id, 'failed', {
          retryCount: Number(local.retryCount || 0) + 1,
          errorMessage: item.error || 'Unknown sync error',
        });
      }
    }
  }

  // Push draft purchase invoices AFTER entities so supplierId / finalProductId / rawMaterialId
  // references are guaranteed to exist on the server side.
  const pendingDraftInvoices = await getPendingPurchaseInvoiceDrafts(restaurantId, 50);
  const invoiceResults = await concurrentMap(pendingDraftInvoices, 5, async (draft) => {
    try {
      await markPurchaseInvoiceSyncState(draft.id, {
        localSyncStatus: 'syncing',
        syncError: null,
      });
      const lineItems = await getPurchaseInvoiceItemsByInvoiceId(draft.id);
      const response = await createPurchaseInvoiceAccounting(
        {
          restaurantId,
          supplierId: Number(draft.supplierId),
          invoiceNumber: String(draft.invoiceNumber || `DRAFT-${draft.id}`),
          purchaseDate:
            String(draft.purchaseDate || '').slice(0, 10) ||
            new Date().toISOString().slice(0, 10),
          items: (lineItems || []).map((x) => ({
            ...(x.rawMaterialId ? { rawMaterialId: Number(x.rawMaterialId) } : {}),
            ...(x.finalProductId ? { finalProductId: Number(x.finalProductId) } : {}),
            quantity: Number(x.quantity),
            unitPrice: Number(x.unitPrice),
            ...(x.salePrice != null ? { salePrice: Number(x.salePrice) } : {}),
            ...(x.warehouseId ? { warehouseId: Number(x.warehouseId) } : {}),
          })),
          extraCosts: Number(draft.extraCosts || 0),
          status: 'pending_approval',
        },
        token,
      );
      await markPurchaseInvoiceSyncState(draft.id, {
        localSyncStatus: 'synced',
        syncError: null,
        serverInvoiceId: response.invoiceId,
      });
      return 1;
    } catch (error: any) {
      const rawMsg = error?.response?.data?.message;
      const syncError = Array.isArray(rawMsg)
        ? rawMsg.join('؛ ')
        : rawMsg || error?.message || 'خطا در ارسال پیش‌نویس خرید';
      await markPurchaseInvoiceSyncState(draft.id, {
        localSyncStatus: 'failed',
        syncError,
      });
      return 0;
    }
  });
  draftPurchaseSynced = invoiceResults.reduce((a, b) => a + b, 0);

  // Push pending purchase return drafts
  const pendingReturnDrafts = await getPendingPurchaseReturnDrafts(restaurantId);
  await concurrentMap(pendingReturnDrafts, 5, async (draft) => {
    try {
      await markPurchaseReturnSyncState(draft.id, 'syncing');
      const items = await accountingDb.purchaseReturnItems
        .where('purchaseReturnId').equals(draft.id).toArray();
      const response = await createPurchaseReturn(
        {
          restaurantId,
          purchaseInvoiceId: Number(draft.purchaseInvoiceId),
          returnDate: String(draft.returnDate || '').slice(0, 10) || new Date().toISOString().slice(0, 10),
          notes: draft.notes || undefined,
          items: (items || []).map((x: any) => ({
            ...(x.rawMaterialId ? { rawMaterialId: Number(x.rawMaterialId) } : {}),
            ...(x.finalProductId ? { finalProductId: Number(x.finalProductId) } : {}),
            quantity: Number(x.quantity),
            unitPrice: Number(x.unitPrice),
          })),
        },
        token,
      );
      await markPurchaseReturnSyncState(draft.id, 'synced', { serverReturnId: response?.id, syncError: null });
    } catch (error: any) {
      const rawMsg = error?.response?.data?.message;
      const syncError = Array.isArray(rawMsg) ? rawMsg.join('؛ ') : rawMsg || error?.message || 'خطا در ارسال مرجوعی';
      await markPurchaseReturnSyncState(draft.id, 'failed', { syncError });
    }
  });

  const pullSinceKey = `accounting:lastPullAt:${restaurantId}`;
  const since = await getSyncMeta(pullSinceKey);
  const pullResult = await syncAccountingPull(restaurantId, token, since || undefined, 1000);

  const [expenseCategoriesFromServer, rawMaterialCategoriesFromServer] = await Promise.all([
    listExpenseCategories(restaurantId, token).catch(() => []),
    listRawMaterialCategories(restaurantId, token).catch(() => []),
  ]);

  await Promise.all([
    upsertPulledEntities('raw_material', pullResult.data.rawMaterials || []),
    upsertPulledEntities('supplier', pullResult.data.suppliers || []),
    upsertPulledEntities('final_product', pullResult.data.finalProducts || []),
    upsertPulledEntities('recipe_item', pullResult.data.recipes || []),
    upsertPulledEntities('cash_bank_account', pullResult.data.cashBankAccounts || []),
    upsertPulledEntities('operational_expense', pullResult.data.operationalExpenses || []),
    upsertPulledExpenseCategories(expenseCategoriesFromServer),
    upsertPulledRawMaterialCategories(rawMaterialCategoriesFromServer),
    upsertPulledInvoices(restaurantId, pullResult.data.purchaseInvoices || []),
    upsertPulledInvoiceItems(pullResult.data.purchaseInvoiceItems || []),
    upsertPulledCheques(pullResult.data.cheques || []),
    upsertPulledReceivables(pullResult.data.customerReceivables || []),
    upsertPulledWarehouses(pullResult.data.warehouses || []),
    upsertPulledWarehouseTransfers(pullResult.data.warehouseTransfers || []),
    upsertPulledWarehouseStocks(pullResult.data.warehouseStocks || []),
    upsertPulledPurchaseReturns(pullResult.data.purchaseReturns || []),
    upsertPulledPurchaseReturnItems(pullResult.data.purchaseReturnItems || []),
  ]);

  const syncedAt = pullResult.syncedAt || new Date().toISOString();
  await setSyncMeta(pullSinceKey, syncedAt);

  const pulled =
    (pullResult.data.rawMaterials?.length || 0) +
    (pullResult.data.suppliers?.length || 0) +
    (pullResult.data.finalProducts?.length || 0) +
    (pullResult.data.recipes?.length || 0) +
    (pullResult.data.cashBankAccounts?.length || 0) +
    (pullResult.data.operationalExpenses?.length || 0) +
    (pullResult.data.cheques?.length || 0) +
    (pullResult.data.customerReceivables?.length || 0) +
    (pullResult.data.warehouses?.length || 0) +
    (pullResult.data.warehouseStocks?.length || 0);

  // Push pending cash transactions to server
  await pushPendingCashTransactions(restaurantId, token).catch((err) =>
    console.warn('[CashSync] pushPendingCashTransactions failed:', err),
  );

  return {
    isOnline: true,
    pushed,
    pushFailed,
    pulled,
    syncedAt,
    draftPurchaseSynced,
  };
}

export async function pushPendingCashTransactions(restaurantId: number, token: string): Promise<void> {
  const pending = await getPendingCashTransactions(restaurantId, 100);
  if (!pending.length) return;

  const { API_BASE_URL } = await import('./api');
  const axios = (await import('axios')).default;

  try {
    const payload = {
      restaurantId,
      transactions: pending.map((tx) => ({
        localId: tx.localId || String(tx.id),
        accountType: tx.accountType,
        accountName: tx.accountName,
        transactionType: tx.transactionType,
        amount: tx.amount,
        orderId: tx.orderId,
        orderNumber: tx.orderNumber,
        customerPhone: tx.customerPhone,
        referenceCode: tx.referenceCode,
        description: tx.description,
        date: tx.date,
        createdAt: tx.createdAt,
      })),
    };
    const res = await axios.post(`${API_BASE_URL}/accounting/cash-transactions/batch`, payload, {
      headers: { Authorization: `Bearer ${token}` },
      timeout: 15000,
    });
    if (res.data?.processed >= 0 || res.data?.skipped >= 0) {
      // Mark all as synced (even skipped ones are already on server)
      const ids = pending.map((tx) => tx.id!).filter(Boolean);
      await markCashTransactionsSynced(ids);
    }
  } catch (err) {
    console.warn('[CashSync] Failed to push cash transactions:', err);
  }
}
