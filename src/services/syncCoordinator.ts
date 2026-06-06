/**
 * هماهنگ‌کننده sync — مانع از اجرای همزمان catalog و accounting sync می‌شود.
 * catalog اول اجرا می‌شود (محصولات/دسته‌ها)، سپس accounting.
 */

type SyncTask = () => Promise<void>;

let _isRunning = false;
let _pendingCatalog: SyncTask | null = null;
let _pendingAccounting: SyncTask | null = null;

async function runQueued() {
  if (_isRunning) return;
  if (!_pendingCatalog && !_pendingAccounting) return;

  _isRunning = true;
  try {
    if (_pendingCatalog) {
      const task = _pendingCatalog;
      _pendingCatalog = null;
      await task();
    }
    if (_pendingAccounting) {
      const task = _pendingAccounting;
      _pendingAccounting = null;
      await task();
    }
  } finally {
    _isRunning = false;
    // اگر در حین اجرا درخواست جدیدی آمده، دوباره اجرا کن
    if (_pendingCatalog || _pendingAccounting) {
      void runQueued();
    }
  }
}

export function scheduleCatalogSync(task: SyncTask) {
  _pendingCatalog = task;
  void runQueued();
}

export function scheduleAccountingSync(task: SyncTask) {
  _pendingAccounting = task;
  void runQueued();
}
