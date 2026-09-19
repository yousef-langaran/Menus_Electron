import {
  accountingDb,
  deleteLocalTempEntity,
  getPendingPurchaseInvoiceDrafts,
  getPurchaseInvoiceItemsByInvoiceId,
  getPendingAccountingOperations,
  getPendingPurchaseReturnDrafts,
  getSyncMeta,
  markPurchaseInvoiceSyncState,
  markPurchaseReturnSyncState,
  reconcileDeletedEntities,
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
  updatePurchaseInvoiceAccounting,
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
  forceFullSync?: boolean;
}): Promise<{
  isOnline: boolean;
  pushed: number;
  pushFailed: number;
  pulled: number;
  syncedAt: string | null;
  draftPurchaseSynced: number;
}> {
  const { restaurantId, token, forceFullSync = false } = args;
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

  // Reset ops stuck in 'syncing' — they can get stuck if a previous sync was
  // interrupted by a network error or server crash before results were processed.
  try {
    let stuckSyncing: any[];
    try {
      stuckSyncing = await accountingDb.syncOperations
        .where('[restaurantId+status]')
        .equals([restaurantId, 'syncing'])
        .toArray();
    } catch {
      // Fallback for older Dexie schema without compound index.
      const all = await accountingDb.syncOperations.toArray();
      stuckSyncing = all.filter(
        (op) => op.restaurantId === restaurantId && op.status === 'syncing',
      );
    }
    if (stuckSyncing.length > 0) {
      const now = new Date().toISOString();
      await Promise.all(
        stuckSyncing.map((op) =>
          accountingDb.syncOperations.update(op.id!, {
            status: 'failed',
            retryCount: Number(op.retryCount || 0) + 1,
            errorMessage: 'Reset from stuck syncing state',
            updatedAt: now,
          }),
        ),
      );
    }
  } catch {
    // non-critical — proceed even if reset fails
  }

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

    try {
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
          if (local.operationType === 'create') {
            // سرور id واقعی خودش را در پاسخ push برنمی‌گرداند (فقط entityId موقت
            // کلاینت را echo می‌کند)، پس رکورد محلیِ با id موقت را همین‌جا حذف کن —
            // pull پایین همین چرخه نسخه‌ی سرور را با id واقعی دوباره می‌آورد. بدون
            // این حذف، رکورد موقت برای همیشه کنار نسخه‌ی سرور باقی می‌ماند (تکراری).
            await deleteLocalTempEntity(local.entityType, local.entityId);
          }
        } else {
          pushFailed += 1;
          await updateOperationSyncStatus(local.id, 'failed', {
            retryCount: Number(local.retryCount || 0) + 1,
            errorMessage: item.error || 'Unknown sync error',
          });
        }
      }
    } catch (pushError: any) {
      // Network error or server 500 — reset all syncing ops to failed so they are retried next time.
      const errMsg = String(pushError?.message || 'Sync push failed');
      for (const op of pendingOps) {
        if (!op.id) continue;
        await updateOperationSyncStatus(op.id, 'failed', {
          retryCount: Number(op.retryCount || 0) + 1,
          errorMessage: errMsg,
        });
      }
      pushFailed += pendingOps.length;
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
      const invoiceNumber = String(draft.invoiceNumber || `DRAFT-${draft.id}`);
      const purchaseDate =
        String(draft.purchaseDate || '').slice(0, 10) ||
        new Date().toISOString().slice(0, 10);
      const itemsPayload = (lineItems || []).map((x) => ({
        ...(x.rawMaterialId ? { rawMaterialId: Number(x.rawMaterialId) } : {}),
        ...(x.finalProductId ? { finalProductId: Number(x.finalProductId) } : {}),
        quantity: Number(x.quantity),
        unitPrice: Number(x.unitPrice),
        ...(x.salePrice != null ? { salePrice: Number(x.salePrice) } : {}),
        ...(x.warehouseId ? { warehouseId: Number(x.warehouseId) } : {}),
      }));

      let syncedServerInvoiceId: number;
      if (draft.serverInvoiceId) {
        // این پیش‌نویس قبلاً یک بار push شده (serverInvoiceId دارد) — اگر دوباره
        // بسازیم، یک فاکتور یتیم تکراری روی سرور می‌مونه و نگاشت محلی به آخرین
        // کپی drift می‌کنه. به‌جاش همون فاکتور سرور رو آپدیت می‌کنیم. اگر در همین
        // فاصله تاییدشده باشه، سرور این را با 400 رد می‌کند — آن مسیر باید از
        // ویرایش فاکتور تاییدشده (صفحه اصلی) انجام شود، نه اینجا.
        await updatePurchaseInvoiceAccounting(
          Number(draft.serverInvoiceId),
          {
            restaurantId,
            supplierId: Number(draft.supplierId),
            invoiceNumber,
            purchaseDate,
            items: itemsPayload,
            extraCosts: Number(draft.extraCosts || 0),
          },
          token,
        );
        syncedServerInvoiceId = Number(draft.serverInvoiceId);
      } else {
        const response = await createPurchaseInvoiceAccounting(
          {
            restaurantId,
            supplierId: Number(draft.supplierId),
            invoiceNumber,
            purchaseDate,
            items: itemsPayload,
            extraCosts: Number(draft.extraCosts || 0),
            status: 'pending_approval',
          },
          token,
        );
        syncedServerInvoiceId = response.invoiceId;
      }
      await markPurchaseInvoiceSyncState(draft.id, {
        localSyncStatus: 'synced',
        syncError: null,
        serverInvoiceId: syncedServerInvoiceId,
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
  const lastFullSyncKey = `accounting:lastFullSyncAt:${restaurantId}`;
  const since = await getSyncMeta(pullSinceKey);
  const lastFullSync = await getSyncMeta(lastFullSyncKey);

  // Full pull (no since filter) when:
  //   - forceFullSync flag set (app just came online or initial load)
  //   - first sync ever (no since stored)
  //   - safety fallback: last full sync was >4h ago (covers long always-online sessions)
  const MS_4H = 4 * 60 * 60 * 1000;
  const needsFullSync =
    forceFullSync ||
    !since ||
    !lastFullSync ||
    Date.now() - new Date(lastFullSync).getTime() > MS_4H;
  const effectiveSince = needsFullSync ? undefined : (since || undefined);

  // هر موجودیت جداگانه با همین سقف از سرور کش می‌شود (getChangedRows، مرتب‌شده
  // بر اساس updatedAt صعودی) — اگر تعداد رکوردهای واقعی یک موجودیت برای این
  // رستوران از این سقف بیشتر باشد، جدیدترین رکوردها (که دیرتر updatedAt خورده‌اند)
  // از این batch جا می‌مانند. رکنسایل زیر باید فقط وقتی روی چنین موجودیتی اجرا شود
  // که batch آن کامل بوده، وگرنه رکوردهای واقعی و جدید را به اشتباه حذف می‌کند.
  const PULL_LIMIT = 1000;
  const pullResult = await syncAccountingPull(restaurantId, token, effectiveSince, PULL_LIMIT);

  // Use null sentinel to distinguish "API failed" from "genuinely empty list"
  const [expenseCategoriesFromServer, rawMaterialCategoriesFromServer] = await Promise.all([
    listExpenseCategories(restaurantId, token).catch(() => null),
    listRawMaterialCategories(restaurantId, token).catch(() => null),
  ]);

  await Promise.all([
    upsertPulledEntities('raw_material', pullResult.data.rawMaterials || []),
    upsertPulledEntities('supplier', pullResult.data.suppliers || []),
    upsertPulledEntities('final_product', pullResult.data.finalProducts || []),
    upsertPulledEntities('recipe_item', pullResult.data.recipes || []),
    upsertPulledEntities('cash_bank_account', pullResult.data.cashBankAccounts || []),
    upsertPulledEntities('operational_expense', pullResult.data.operationalExpenses || []),
    expenseCategoriesFromServer !== null
      ? upsertPulledExpenseCategories(expenseCategoriesFromServer)
      : Promise.resolve(),
    rawMaterialCategoriesFromServer !== null
      ? upsertPulledRawMaterialCategories(rawMaterialCategoriesFromServer)
      : Promise.resolve(),
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

  // Categories are always fetched in full — reconcile on every successful call.
  await Promise.allSettled([
    expenseCategoriesFromServer !== null
      ? reconcileDeletedEntities(restaurantId, 'expense_category',
          new Set(expenseCategoriesFromServer.map((r: any) => Number(r.id))))
      : Promise.resolve(),
    rawMaterialCategoriesFromServer !== null
      ? reconcileDeletedEntities(restaurantId, 'raw_material_category',
          new Set(rawMaterialCategoriesFromServer.map((r: any) => Number(r.id))))
      : Promise.resolve(),
  ]);

  // After a full pull, reconcile deletions for entities that can be deleted from server.
  if (needsFullSync) {
    const serverWarehouseIds = new Set((pullResult.data.warehouses || []).map((r: any) => Number(r.id)));
    const serverPurchaseInvoiceIds = new Set((pullResult.data.purchaseInvoices || []).map((r: any) => Number(r.id)));

    const suppliersBatch = pullResult.data.suppliers || [];
    const rawMaterialsBatch = pullResult.data.rawMaterials || [];
    const finalProductsBatch = pullResult.data.finalProducts || [];
    const cashBankAccountsBatch = pullResult.data.cashBankAccounts || [];
    const recipesBatch = pullResult.data.recipes || [];
    const operationalExpensesBatch = pullResult.data.operationalExpenses || [];

    await Promise.allSettled([
      // فقط وقتی pull به سقف PULL_LIMIT محدود نشده اجرا کن — وگرنه رکوردهای
      // واقعی خارج از این batch (رستوران‌های با حجم بالا) اشتباهی حذف می‌شوند
      // (همان باگی که برای purchaseInvoices پایین‌تر قبلاً رفع شده بود).
      suppliersBatch.length < PULL_LIMIT
        ? reconcileDeletedEntities(restaurantId, 'supplier', new Set(suppliersBatch.map((r: any) => Number(r.id))))
        : Promise.resolve(),
      rawMaterialsBatch.length < PULL_LIMIT
        ? reconcileDeletedEntities(restaurantId, 'raw_material', new Set(rawMaterialsBatch.map((r: any) => Number(r.id))))
        : Promise.resolve(),
      finalProductsBatch.length < PULL_LIMIT
        ? reconcileDeletedEntities(restaurantId, 'final_product', new Set(finalProductsBatch.map((r: any) => Number(r.id))))
        : Promise.resolve(),
      cashBankAccountsBatch.length < PULL_LIMIT
        ? reconcileDeletedEntities(restaurantId, 'cash_bank_account', new Set(cashBankAccountsBatch.map((r: any) => Number(r.id))))
        : Promise.resolve(),
      recipesBatch.length < PULL_LIMIT
        ? reconcileDeletedEntities(restaurantId, 'recipe_item', new Set(recipesBatch.map((r: any) => Number(r.id))))
        : Promise.resolve(),
      operationalExpensesBatch.length < PULL_LIMIT
        ? reconcileDeletedEntities(restaurantId, 'operational_expense', new Set(operationalExpensesBatch.map((r: any) => Number(r.id))))
        : Promise.resolve(),
      // Warehouses are read-only pulled entities — reconcile inline.
      accountingDb.warehouses.where('restaurantId').equals(restaurantId).toArray().then((local) => {
        const toDelete = local.filter((w) => !serverWarehouseIds.has(Number(w.id))).map((w) => w.id);
        return toDelete.length ? accountingDb.warehouses.bulkDelete(toDelete) : Promise.resolve();
      }),
      // فاکتورهای خرید که سرور دیگر برنمی‌گرداند (چون ویرایش و با فاکتور جدید
      // جایگزین شده‌اند) را از Dexie محلی حذف کن — وگرنه فاکتور قدیمی برای همیشه
      // در Electron باقی می‌ماند و کنار فاکتور جدید با همان شماره تکراری دیده می‌شود.
      // پیش‌نویس‌های محلی که هنوز هرگز push نشده‌اند (serverInvoiceId ندارند) دست‌نخورده می‌مانند.
      // فقط وقتی pull به سقف 1000 محدود نشده اجرا کن — وگرنه فاکتورهای واقعی
      // خارج از این batch (رستوران‌های خیلی بزرگ) اشتباهی حذف می‌شوند.
      (pullResult.data.purchaseInvoices || []).length < PULL_LIMIT
        ? accountingDb.purchaseInvoices.where('restaurantId').equals(restaurantId).toArray().then((local) => {
            const toDelete = local
              .filter((inv) => inv.serverInvoiceId != null && !serverPurchaseInvoiceIds.has(Number(inv.serverInvoiceId)))
              .map((inv) => inv.id);
            return toDelete.length ? accountingDb.purchaseInvoices.bulkDelete(toDelete) : Promise.resolve();
          })
        : Promise.resolve(),
    ]);
    await setSyncMeta(lastFullSyncKey, new Date().toISOString());
  }

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

  // اطلاع به کامپوننت‌های React که sync حسابداری انجام شد (مثلاً برای به‌روزرسانی
  // موجودی نمایش‌داده‌شده در لیست محصولات).
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event('accounting:synced'));
  }

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
