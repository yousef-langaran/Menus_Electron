/**
 * هماهنگ‌کننده sync — مانع از اجرای همزمان catalog و accounting sync می‌شود.
 * catalog اول اجرا می‌شود (محصولات/دسته‌ها)، سپس accounting.
 */

type SyncTask = () => Promise<void>;

let _isRunning = false;
let _pendingCatalog: SyncTask | null = null;
let _pendingAccounting: SyncTask | null = null;

// اجرای واقعی runQueued() همیشه به یک microtask موکول می‌شود (نه فراخوانی مستقیم
// و همزمان از داخل scheduleCatalogSync/scheduleAccountingSync). دلیل: اگر هر دو
// scheduler در همان synchronous turn (مثلاً دو useEffect خواهر که در همان commit
// اجرا می‌شوند، یا دو listener روی همان رویداد "online") صدا زده شوند، باید هر دو
// فرصت ثبت‌شدن در _pendingCatalog/_pendingAccounting را داشته باشند پیش از آنکه
// runQueued() تصمیم بگیرد کدام task را اجرا کند. طبق مدل run-to-completion جاوااسکریپت
// هیچ microtask‌ای پیش از پایان کامل turn همزمان جاری اجرا نمی‌شود، پس این یک تضمین
// ساختاری است، نه یک تأخیر دلبخواهی شبیه setTimeout.
let _runQueuedScheduled = false;

function scheduleRunQueued() {
  if (_runQueuedScheduled) return;
  _runQueuedScheduled = true;
  void Promise.resolve().then(() => {
    _runQueuedScheduled = false;
    void runQueued();
  });
}

async function runQueued() {
  if (_isRunning) return;
  if (!_pendingCatalog && !_pendingAccounting) return;

  _isRunning = true;
  try {
    // ترتیب catalog-before-accounting همیشه اینجا اعمال می‌شود: صرف‌نظر از اینکه
    // کدام schedule*Sync زودتر صدا زده شده، اگر catalog در صف باشد همیشه اول اجرا می‌شود.
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
  scheduleRunQueued();
}

export function scheduleAccountingSync(task: SyncTask) {
  _pendingAccounting = task;
  scheduleRunQueued();
}

// ─── KNOWN RESIDUAL LIMITATION (T-0025, tracked, not yet closed) ───────────
//
// The microtask-deferral guarantee above (T-0021) only holds for scheduling
// calls made within the *same synchronous JS turn* — e.g. two sibling
// useEffect mounts, or two listeners on the same "online"/"focus" event.
// That covers both real trigger sites in this app today (see
// CatalogSyncManager.tsx / AccountingSyncManager.tsx mount effects and the
// shared browser event listeners), so the originally-reported P0 is fixed.
//
// It does NOT cover a cross-macrotask interleaving: AccountingSyncManager's
// 30s `setInterval` and CatalogSyncManager's 60s `setInterval` are two
// independent macrotasks. If the accounting interval fires first (with no
// catalog task pending), `runQueued()` has no way to know a catalog run is
// about to be requested — it correctly starts accounting immediately, per
// its own contract. If the catalog interval then happens to fire moments
// later, *while accounting's task is still in-flight awaiting a real
// promise*, `scheduleCatalogSync()` only registers the task as pending;
// `runQueued()` is already past the `_isRunning` guard and won't re-inspect
// `_pendingCatalog` until the current accounting task's `finally` block
// re-invokes it — i.e. catalog will run, but only *after* accounting has
// already fully completed, not before it. This reproduces the original
// FK-race-avoidance violation, just via a much narrower/rarer timing window
// (two independent timer intervals landing within milliseconds of each
// other) rather than on every cold start.
//
// This is intentionally left as a documented gap rather than "fixed" here:
// closing it properly would require either (a) making `runQueued()` able to
// interrupt/checkpoint an opaque in-flight `SyncTask` mid-await — which the
// `() => Promise<void>` contract does not support without a breaking change
// to every call site — or (b) inserting an artificial grace/debounce window
// before committing to run an accounting-only cycle, which trades a rare
// correctness edge case for guaranteed latency and new flakiness on every
// single accounting sync. Neither was judged worth it for a P3 found via
// code review, not a real bug report. See
// `src/services/__tests__/syncCoordinator.test.ts` for a regression test
// that reproduces and documents this exact interleaving. If this ever
// becomes an observed production issue, revisit with `tech-lead` before
// changing `runQueued()`'s locking model.
