// Dexie needs a real (or fake) IndexedDB backend, which jsdom does not provide.
// This must be imported before accountingLocalDb.ts (which constructs the
// Dexie database at module load time) is ever imported, directly or
// transitively (it also imports catalogLocalDb, which does the same).
import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Only the API layer is mocked — accountingSync's interaction with its local
// Dexie store (accountingLocalDb) is exercised for real via fake-indexeddb,
// so idempotency assertions reflect actual local state transitions.
vi.mock('../api', () => ({
  createPurchaseInvoiceAccounting: vi.fn(),
  updatePurchaseInvoiceAccounting: vi.fn(),
  createPurchaseReturn: vi.fn(),
  listExpenseCategories: vi.fn(),
  listRawMaterialCategories: vi.fn(),
  syncAccountingPull: vi.fn(),
  syncAccountingPush: vi.fn(),
}));

import * as api from '../api';
import { runAccountingSync } from '../accountingSync';
import {
  accountingDb,
  cancelPendingSyncOp,
  createExpenseCategoryLocal,
  createPurchaseInvoiceLocal,
  createRawMaterialCategoryLocal,
  createRawMaterialLocal,
  enqueueAccountingOperation,
  setSyncMeta,
  updatePurchaseInvoiceDraftLocal,
} from '../accountingLocalDb';

const RID = 42;
const TOKEN = 'test-token';

function emptyPullResult(overrides?: Partial<any>) {
  return {
    syncedAt: new Date().toISOString(),
    strategy: 'last-write-wins' as const,
    since: null,
    data: {
      rawMaterials: [],
      suppliers: [],
      finalProducts: [],
      recipes: [],
      cashBankAccounts: [],
      operationalExpenses: [],
      purchaseInvoices: [],
      purchaseInvoiceItems: [],
      cheques: [],
      customerReceivables: [],
      warehouses: [],
      purchaseReturns: [],
      purchaseReturnItems: [],
      ...overrides,
    },
  };
}

/** Echoes every pushed op back as 'synced' — the common "server accepted everything" case. */
function mockPushAllSynced() {
  (api.syncAccountingPush as any).mockImplementation(async (_rid: number, ops: any[]) => ({
    syncedAt: new Date().toISOString(),
    results: ops.map((op) => ({
      localOpId: op.localOpId,
      status: 'synced' as const,
      entityType: op.entityType,
      entityId: op.entityId,
    })),
  }));
}

beforeEach(async () => {
  vi.clearAllMocks();
  await Promise.all([
    accountingDb.rawMaterials.clear(),
    accountingDb.suppliers.clear(),
    accountingDb.rawMaterialCategories.clear(),
    accountingDb.expenseCategories.clear(),
    accountingDb.purchaseInvoices.clear(),
    accountingDb.purchaseInvoiceItems.clear(),
    accountingDb.syncOperations.clear(),
    accountingDb.syncMeta.clear(),
    accountingDb.cashAccountTransactions.clear(),
  ]);
  (api.syncAccountingPull as any).mockResolvedValue(emptyPullResult());
  (api.listExpenseCategories as any).mockResolvedValue([]);
  (api.listRawMaterialCategories as any).mockResolvedValue([]);
  // These tests are about push behavior. Seed "a full pull already happened
  // recently" so runAccountingSync's post-full-pull reconciliation (which
  // deletes any local row an empty mocked pull response doesn't mention —
  // e.g. purchase invoices) does not run and interfere with push-only
  // assertions. Full-pull reconciliation has its own dedicated test below.
  const recent = new Date().toISOString();
  await setSyncMeta(`accounting:lastPullAt:${RID}`, recent);
  await setSyncMeta(`accounting:lastFullSyncAt:${RID}`, recent);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('runAccountingSync entity-operation push idempotency', () => {
  it('pushes a single queued create operation exactly once across two sync runs', async () => {
    await createRawMaterialLocal({ restaurantId: RID, name: 'آرد', unit: 'kg' });
    mockPushAllSynced();

    const first = await runAccountingSync({ restaurantId: RID, token: TOKEN });
    expect(first.pushed).toBe(1);
    expect(first.pushFailed).toBe(0);
    expect(api.syncAccountingPush).toHaveBeenCalledTimes(1);

    const opsAfterFirst = await accountingDb.syncOperations.toArray();
    expect(opsAfterFirst).toHaveLength(1);
    expect(opsAfterFirst[0].status).toBe('synced');

    // Simulate a second, redundant sync trigger.
    const second = await runAccountingSync({ restaurantId: RID, token: TOKEN });
    expect(second.pushed).toBe(0);
    // The regression this protects: syncAccountingPush must not be called
    // again with an already-synced op just because sync ran twice.
    expect(api.syncAccountingPush).toHaveBeenCalledTimes(1);
  });

  it('retries a failed push on the next sync and stops once it succeeds, without ever double-reporting success', async () => {
    await createRawMaterialLocal({ restaurantId: RID, name: 'شکر', unit: 'kg' });

    // First call throws (simulated network error) -> op should flip to 'failed' with retryCount 1.
    (api.syncAccountingPush as any).mockRejectedValueOnce(new Error('network down'));

    const first = await runAccountingSync({ restaurantId: RID, token: TOKEN });
    expect(first.pushFailed).toBe(1);
    const opsAfterFirst = await accountingDb.syncOperations.toArray();
    expect(opsAfterFirst[0].status).toBe('failed');
    expect(opsAfterFirst[0].retryCount).toBe(1);

    mockPushAllSynced();
    const second = await runAccountingSync({ restaurantId: RID, token: TOKEN });
    expect(second.pushed).toBe(1);
    expect(second.pushFailed).toBe(0);

    const third = await runAccountingSync({ restaurantId: RID, token: TOKEN });
    expect(third.pushed).toBe(0);
    // Total real network attempts: 1 failure + 1 success, never a redundant 3rd send.
    expect(api.syncAccountingPush).toHaveBeenCalledTimes(2);
  });

  it('resets an operation stuck in "syncing" (e.g. app crashed mid-push) back to failed and retries it on the next sync', async () => {
    const now = new Date().toISOString();
    await accountingDb.syncOperations.add({
      localOpId: 'stuck-op',
      restaurantId: RID,
      entityType: 'raw_material',
      entityId: '-5',
      operationType: 'create',
      payload: { id: -5, name: 'نمک' },
      status: 'syncing',
      version: 1,
      retryCount: 0,
      clientUpdatedAt: now,
      createdAt: now,
      updatedAt: now,
    });
    mockPushAllSynced();

    const result = await runAccountingSync({ restaurantId: RID, token: TOKEN });
    expect(result.pushed).toBe(1);
    const op = (await accountingDb.syncOperations.toArray())[0];
    expect(op.status).toBe('synced');
  });
});

describe('runAccountingSync purchase-invoice draft push (regression for commit 43ffa88: duplicate invoice on edit)', () => {
  it('creates the invoice on first push, then PATCHes the same server invoice on a re-push after edit instead of creating a duplicate', async () => {
    const { invoice } = await createPurchaseInvoiceLocal({
      restaurantId: RID,
      supplierId: 1,
      invoiceNumber: 'INV-1',
      purchaseDate: '2026-09-01',
      items: [{ rawMaterialId: 1, quantity: 2, unitPrice: 1000 }],
    });

    (api.createPurchaseInvoiceAccounting as any).mockResolvedValue({
      invoiceId: 5001,
      status: 'pending_approval',
      totalAmount: 2000,
      paidAmount: 0,
      debtAmount: 2000,
      items: 1,
      payments: 0,
    });

    const first = await runAccountingSync({ restaurantId: RID, token: TOKEN });
    expect(first.draftPurchaseSynced).toBe(1);
    expect(api.createPurchaseInvoiceAccounting).toHaveBeenCalledTimes(1);
    expect(api.updatePurchaseInvoiceAccounting).not.toHaveBeenCalled();

    const afterFirst = await accountingDb.purchaseInvoices.get(invoice.id);
    expect(afterFirst?.localSyncStatus).toBe('synced');
    expect(afterFirst?.serverInvoiceId).toBe(5001);

    // A redundant sync with nothing edited must not create a second server invoice.
    const redundant = await runAccountingSync({ restaurantId: RID, token: TOKEN });
    expect(redundant.draftPurchaseSynced).toBe(0);
    expect(api.createPurchaseInvoiceAccounting).toHaveBeenCalledTimes(1);

    // The user edits the (already-synced) draft before it was approved —
    // this flips localSyncStatus back to 'pending' but keeps serverInvoiceId.
    await updatePurchaseInvoiceDraftLocal({
      invoiceId: invoice.id,
      restaurantId: RID,
      supplierId: 1,
      invoiceNumber: 'INV-1',
      purchaseDate: '2026-09-01',
      items: [{ rawMaterialId: 1, quantity: 3, unitPrice: 1000 }],
    });
    (api.updatePurchaseInvoiceAccounting as any).mockResolvedValue({});

    const afterEditSync = await runAccountingSync({ restaurantId: RID, token: TOKEN });
    expect(afterEditSync.draftPurchaseSynced).toBe(1);
    // This is the exact bug from commit 43ffa88: re-syncing an edited draft
    // that already has a serverInvoiceId must PATCH, never POST a new one.
    expect(api.createPurchaseInvoiceAccounting).toHaveBeenCalledTimes(1);
    expect(api.updatePurchaseInvoiceAccounting).toHaveBeenCalledTimes(1);
    expect(api.updatePurchaseInvoiceAccounting).toHaveBeenCalledWith(
      5001,
      expect.objectContaining({ restaurantId: RID, invoiceNumber: 'INV-1' }),
      TOKEN,
    );

    const finalRow = await accountingDb.purchaseInvoices.get(invoice.id);
    expect(finalRow?.serverInvoiceId).toBe(5001);
    expect(finalRow?.localSyncStatus).toBe('synced');
  });
});

describe('runAccountingSync full-pull reconciliation', () => {
  it('deletes a previously-synced purchase invoice draft the server no longer returns on a full pull (superseded-by-edit cleanup from commit c955b25)', async () => {
    const { invoice } = await createPurchaseInvoiceLocal({
      restaurantId: RID,
      supplierId: 1,
      invoiceNumber: 'INV-OLD',
      purchaseDate: '2026-08-01',
      items: [{ rawMaterialId: 1, quantity: 1, unitPrice: 1000 }],
    });
    await accountingDb.purchaseInvoices.update(invoice.id, {
      localSyncStatus: 'synced',
      serverInvoiceId: 4000,
    });
    // Force a full pull (undo the beforeEach seed) and simulate the server no
    // longer listing invoice 4000 — e.g. it was superseded by an edit.
    await accountingDb.syncMeta.delete(`accounting:lastFullSyncAt:${RID}`);
    await accountingDb.syncMeta.delete(`accounting:lastPullAt:${RID}`);
    (api.syncAccountingPull as any).mockResolvedValue(emptyPullResult());

    await runAccountingSync({ restaurantId: RID, token: TOKEN });

    expect(await accountingDb.purchaseInvoices.get(invoice.id)).toBeUndefined();
  });

  it('does NOT delete a local draft that has never been pushed yet (no serverInvoiceId), even on a full pull', async () => {
    const { invoice } = await createPurchaseInvoiceLocal({
      restaurantId: RID,
      supplierId: 1,
      invoiceNumber: 'INV-NEW-DRAFT',
      purchaseDate: '2026-09-01',
      items: [{ rawMaterialId: 1, quantity: 1, unitPrice: 1000 }],
    });
    await accountingDb.syncMeta.delete(`accounting:lastFullSyncAt:${RID}`);
    await accountingDb.syncMeta.delete(`accounting:lastPullAt:${RID}`);
    (api.syncAccountingPull as any).mockResolvedValue(emptyPullResult());
    (api.createPurchaseInvoiceAccounting as any).mockRejectedValue(new Error('still offline'));

    await runAccountingSync({ restaurantId: RID, token: TOKEN });

    expect(await accountingDb.purchaseInvoices.get(invoice.id)).toBeDefined();
  });
});

describe('regression: raw-material-category / expense-category double-write (commits 6e090fe, babc84c)', () => {
  // The real bug: createXLocal() ALWAYS queues a local sync op (that is the
  // whole point of the offline-first design). The page components additionally
  // made a *direct* online API call for immediate UI feedback, but forgot to
  // cancel the now-redundant queued op — so the next background sync resent
  // it, and because its entityId was still the local temp ID, the server
  // created a genuine duplicate row.

  it('BUG PATTERN: raw_material_category — a direct online create without cancelPendingSyncOp gets resent by the next sync', async () => {
    const created = await createRawMaterialCategoryLocal({ restaurantId: RID, name: 'دسته آرد' });
    // (bug) the page's direct online API call is not modeled here — the
    // point is that it never called cancelPendingSyncOp afterward, so the
    // op createRawMaterialCategoryLocal queued is still there:
    const pendingBefore = await accountingDb.syncOperations
      .where('entityType').equals('raw_material_category').toArray();
    expect(pendingBefore).toHaveLength(1);

    mockPushAllSynced();
    await runAccountingSync({ restaurantId: RID, token: TOKEN });

    // This resend is exactly the duplicate-row mechanism from commit 6e090fe.
    expect(api.syncAccountingPush).toHaveBeenCalledTimes(1);
    const [, opsSent] = (api.syncAccountingPush as any).mock.calls[0];
    expect(opsSent.map((o: any) => o.entityId)).toContain(String(created.id));
  });

  it('FIX CONFIRMED: raw_material_category — calling cancelPendingSyncOp after the direct online create prevents the resend', async () => {
    const created = await createRawMaterialCategoryLocal({ restaurantId: RID, name: 'دسته شکر' });
    // Correct sequence used by the fixed page code: after the direct online
    // call succeeds, cancel the auto-queued local op.
    await cancelPendingSyncOp('raw_material_category', String(created.id));

    const pendingAfterCancel = await accountingDb.syncOperations.toArray();
    expect(pendingAfterCancel).toHaveLength(0);

    mockPushAllSynced();
    await runAccountingSync({ restaurantId: RID, token: TOKEN });

    expect(api.syncAccountingPush).not.toHaveBeenCalled();
  });

  it('BUG PATTERN: expense_category — a direct online create without cancelPendingSyncOp gets resent by the next sync', async () => {
    const created = await createExpenseCategoryLocal({ restaurantId: RID, name: 'هزینه اجاره' });
    mockPushAllSynced();
    await runAccountingSync({ restaurantId: RID, token: TOKEN });

    expect(api.syncAccountingPush).toHaveBeenCalledTimes(1);
    const [, opsSent] = (api.syncAccountingPush as any).mock.calls[0];
    expect(opsSent.map((o: any) => o.entityId)).toContain(String(created.id));
  });

  it('FIX CONFIRMED: expense_category — calling cancelPendingSyncOp after the direct online create prevents the resend', async () => {
    const created = await createExpenseCategoryLocal({ restaurantId: RID, name: 'هزینه آب و برق' });
    await cancelPendingSyncOp('expense_category', String(created.id));

    mockPushAllSynced();
    await runAccountingSync({ restaurantId: RID, token: TOKEN });

    expect(api.syncAccountingPush).not.toHaveBeenCalled();
  });

  it('cancelPendingSyncOp only removes the matching entity, leaving unrelated queued ops (e.g. an in-flight expense create) untouched', async () => {
    const category = await createRawMaterialCategoryLocal({ restaurantId: RID, name: 'دسته برنج' });
    await enqueueAccountingOperation({
      localOpId: 'unrelated-op',
      restaurantId: RID,
      entityType: 'operational_expense',
      entityId: '-999',
      operationType: 'create',
      payload: { id: -999 },
      version: 1,
      clientUpdatedAt: new Date().toISOString(),
    });

    await cancelPendingSyncOp('raw_material_category', String(category.id));

    const remaining = await accountingDb.syncOperations.toArray();
    expect(remaining).toHaveLength(1);
    expect(remaining[0].localOpId).toBe('unrelated-op');
  });
});
