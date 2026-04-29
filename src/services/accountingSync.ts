import {
  accountingDb,
  getPendingPurchaseInvoiceDrafts,
  getPurchaseInvoiceItemsByInvoiceId,
  getPendingAccountingOperations,
  getSyncMeta,
  markPurchaseInvoiceSyncState,
  setSyncMeta,
  updateOperationSyncStatus,
  upsertPulledEntities,
} from './accountingLocalDb';
import {
  createPurchaseInvoiceAccounting,
  syncAccountingPull,
  syncAccountingPush,
} from './api';

function resolveOnlineStatus(): Promise<boolean> {
  if (typeof window !== 'undefined' && window.electronAPI?.checkOnline) {
    return window.electronAPI.checkOnline();
  }
  return Promise.resolve(typeof navigator !== 'undefined' ? navigator.onLine : true);
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

  const pendingOps = await getPendingAccountingOperations(restaurantId, 200);
  let pushed = 0;
  let pushFailed = 0;
  let draftPurchaseSynced = 0;

  const pendingDraftInvoices = await getPendingPurchaseInvoiceDrafts(restaurantId, 50);
  for (const draft of pendingDraftInvoices) {
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
            rawMaterialId: Number(x.rawMaterialId),
            quantity: Number(x.quantity),
            unitPrice: Number(x.unitPrice),
          })),
          extraCosts: Number(draft.extraCosts || 0),
          status: 'pending_approval',
        },
        token,
      );
      draftPurchaseSynced += 1;
      await markPurchaseInvoiceSyncState(draft.id, {
        localSyncStatus: 'synced',
        syncError: null,
        serverInvoiceId: response.invoiceId,
      });
    } catch (error: any) {
      await markPurchaseInvoiceSyncState(draft.id, {
        localSyncStatus: 'failed',
        syncError: error?.response?.data?.message || error?.message || 'Draft purchase sync failed',
      });
    }
  }

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

  const pullSinceKey = `accounting:lastPullAt:${restaurantId}`;
  const since = await getSyncMeta(pullSinceKey);
  const pullResult = await syncAccountingPull(restaurantId, token, since || undefined, 1000);

  await Promise.all([
    upsertPulledEntities('raw_material', pullResult.data.rawMaterials || []),
    upsertPulledEntities('supplier', pullResult.data.suppliers || []),
    upsertPulledEntities('final_product', pullResult.data.finalProducts || []),
    upsertPulledEntities('recipe_item', pullResult.data.recipes || []),
    upsertPulledEntities('cash_bank_account', pullResult.data.cashBankAccounts || []),
    upsertPulledEntities('operational_expense', pullResult.data.operationalExpenses || []),
  ]);

  const syncedAt = pullResult.syncedAt || new Date().toISOString();
  await setSyncMeta(pullSinceKey, syncedAt);

  const pulled =
    (pullResult.data.rawMaterials?.length || 0) +
    (pullResult.data.suppliers?.length || 0) +
    (pullResult.data.finalProducts?.length || 0) +
    (pullResult.data.recipes?.length || 0) +
    (pullResult.data.cashBankAccounts?.length || 0) +
    (pullResult.data.operationalExpenses?.length || 0);

  return {
    isOnline: true,
    pushed,
    pushFailed,
    pulled,
    syncedAt,
    draftPurchaseSynced,
  };
}
