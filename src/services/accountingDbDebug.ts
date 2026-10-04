import { accountingDb } from './accountingDbCore';

// ─── ابزار تشخیصی موقت (کنسول DevTools) ─────────────────────────────────────
// برای ردیابی گزارش «هزینه‌ها یهو از پنل ویندوز محو می‌شوند» بدون نیاز به صبر
// کردن برای سیکل بعدی sync. در DevTools (Ctrl+Shift+I) تایپ کن:
//   __acctDebug.dumpExpenses()
//   __acctDebug.dumpSyncOps('operational_expense')
// بعد از رفع قطعی باگ حذف شود.
if (typeof window !== 'undefined') {
  (window as any).__acctDebug = {
    dumpExpenses: async () => {
      const rows = await accountingDb.operationalExpenses.toArray();
      console.table(
        rows.map((r) => ({
          id: r.id,
          restaurantId: r.restaurantId,
          date: r.expenseDate,
          amount: r.amount,
          category: r.expenseCategory?.name ?? r.expenseCategoryId,
          updatedAt: r.updatedAt,
        })),
      );
      return rows;
    },
    dumpSyncOps: async (entityType?: string) => {
      const all = await accountingDb.syncOperations.toArray();
      const filtered = entityType ? all.filter((o) => o.entityType === entityType) : all;
      console.table(
        filtered.map((o) => ({
          id: o.id,
          entityType: o.entityType,
          entityId: o.entityId,
          op: o.operationType,
          status: o.status,
          retryCount: o.retryCount,
          errorMessage: o.errorMessage,
          updatedAt: o.updatedAt,
        })),
      );
      return filtered;
    },
  };
}
