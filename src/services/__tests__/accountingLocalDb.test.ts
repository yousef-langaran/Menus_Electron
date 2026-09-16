// Dexie needs a real (or fake) IndexedDB backend, which jsdom does not provide.
// Must be imported before accountingLocalDb.ts is loaded (directly or transitively).
import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  accountingDb,
  deleteOperationalExpenseLocal,
  upsertPulledEntities,
} from '../accountingLocalDb';

const RID = 42;

beforeEach(async () => {
  await Promise.all([
    accountingDb.operationalExpenses.clear(),
    accountingDb.syncOperations.clear(),
  ]);
});

afterEach(async () => {
  await Promise.all([
    accountingDb.operationalExpenses.clear(),
    accountingDb.syncOperations.clear(),
  ]);
});

// Regression for: "هزینه رو که حذف می‌کنم از لیست نمی‌ره باید رفرش کنم".
// Root cause: OperationalExpense.id is a Postgres bigint column with no
// TypeORM transformer, so the server always serializes it as a STRING —
// while locally created rows use a client-generated `number` id
// (nextLocalEntityId). IndexedDB treats a numeric key and its string
// twin as different keys, so `.delete(Number(row.id))` on a
// string-keyed pulled row silently no-ops.
describe('upsertPulledEntities — bigint id normalization', () => {
  it('stores pulled rows with a numeric id even though the server sends id as a string', async () => {
    await upsertPulledEntities('operational_expense', [
      { id: '1758012345678', restaurantId: RID, amount: 100000, expenseCategoryId: '1' },
    ]);

    const row = await accountingDb.operationalExpenses.get(1758012345678);
    expect(row).toBeTruthy();
    expect(typeof row!.id).toBe('number');

    // The exact bug: deleting by the coerced-number id must actually find the row.
    await accountingDb.operationalExpenses.delete(1758012345678);
    expect(await accountingDb.operationalExpenses.get(1758012345678)).toBeUndefined();
  });

  it('cleans up a leftover string-keyed duplicate from before the fix on the next pull', async () => {
    // Simulate corrupted pre-fix local state: the same expense stored under a
    // string key (as it would have been by the old, unnormalized upsert).
    await accountingDb.operationalExpenses.put({
      id: '999' as any,
      restaurantId: RID,
      amount: 50000,
      expenseCategoryId: 1,
    });

    await upsertPulledEntities('operational_expense', [
      { id: '999', restaurantId: RID, amount: 50000, expenseCategoryId: 1 },
    ]);

    const all = await accountingDb.operationalExpenses.toArray();
    const matching = all.filter((r) => Number(r.id) === 999);
    expect(matching).toHaveLength(1);
    expect(typeof matching[0].id).toBe('number');
  });

  it('does not resurrect a row with an unconfirmed queued delete', async () => {
    await accountingDb.operationalExpenses.put({ id: 555, restaurantId: RID, amount: 1, expenseCategoryId: 1 });
    await deleteOperationalExpenseLocal({ id: 555, restaurantId: RID });
    expect(await accountingDb.operationalExpenses.get(555)).toBeUndefined();

    // A racing background pull that fetched the pre-delete server snapshot
    // must not bring the row back while the delete is still queued.
    await upsertPulledEntities('operational_expense', [
      { id: '555', restaurantId: RID, amount: 1, expenseCategoryId: 1 },
    ]);
    expect(await accountingDb.operationalExpenses.get(555)).toBeUndefined();
  });
});

describe('deleteOperationalExpenseLocal — dual-key delete', () => {
  it('removes a legacy string-keyed row even though the caller passes a numeric id', async () => {
    await accountingDb.operationalExpenses.put({ id: '777' as any, restaurantId: RID, amount: 1, expenseCategoryId: 1 });

    await deleteOperationalExpenseLocal({ id: 777, restaurantId: RID });

    const all = await accountingDb.operationalExpenses.toArray();
    expect(all.filter((r) => Number(r.id) === 777)).toHaveLength(0);
  });
});
