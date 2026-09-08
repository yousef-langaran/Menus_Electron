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
