import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuthStore } from '../store/authStore';
import {
  getLocalServiceBoards,
  getLocalServiceJobs,
  createServiceJobLocal,
  type LocalServiceBoard,
  type LocalServiceJob,
  type ServiceJobPriority,
} from '../services/serviceJobsLocalDb';
import { runServiceJobsSync } from '../services/serviceJobsSync';

// ─── Priority meta ────────────────────────────────────────────────────────────
const PRIORITY_LABEL: Record<ServiceJobPriority, string> = {
  low: 'کم',
  medium: 'معمولی',
  high: 'زیاد',
  urgent: 'فوری',
};
const PRIORITY_COLOR: Record<ServiceJobPriority, string> = {
  low: '#6b7280',
  medium: '#3b82f6',
  high: '#f59e0b',
  urgent: '#ef4444',
};

// ─── Create Job Modal ─────────────────────────────────────────────────────────
interface CreateJobModalProps {
  boards: LocalServiceBoard[];
  onClose: () => void;
  onCreated: (job: LocalServiceJob) => void;
  restaurantId: number;
}

function CreateJobModal({ boards, onClose, onCreated, restaurantId }: CreateJobModalProps) {
  const [boardId, setBoardId] = useState<number>(boards[0]?.id ?? 0);
  const [title, setTitle] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [priority, setPriority] = useState<ServiceJobPriority>('medium');
  const [description, setDescription] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');

  const selectedBoard = boards.find((b) => b.id === boardId);
  const intakeStatus = selectedBoard?.statuses.find((s) => s.category === 'intake') ?? selectedBoard?.statuses[0];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) { setError('عنوان پرونده الزامی است'); return; }
    if (!boardId) { setError('یک بورد انتخاب کنید'); return; }
    setError('');
    setIsSubmitting(true);
    try {
      const job = await createServiceJobLocal({
        restaurantId,
        boardId,
        boardName: selectedBoard?.name ?? null,
        title: title.trim(),
        description: description.trim() || undefined,
        customerName: customerName.trim() || undefined,
        customerPhone: customerPhone.trim() || undefined,
        priority,
        statusId: intakeStatus?.id,
        statusLabel: intakeStatus?.label,
        statusColor: intakeStatus?.color ?? undefined,
        statusCategory: intakeStatus?.category,
      });
      onCreated(job);
    } catch (e: any) {
      setError(e?.message || 'خطا در ثبت پرونده');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" dir="rtl">
      <div className="bg-white dark:bg-zinc-900 rounded-2xl shadow-2xl w-full max-w-md">
        <div className="flex items-center justify-between p-4 border-b border-default-200">
          <h2 className="font-bold text-base">ثبت پرونده خدمت جدید</h2>
          <button
            type="button"
            onClick={onClose}
            className="text-default-400 hover:text-default-600 p-1 rounded-lg hover:bg-default-100 transition-colors text-lg leading-none"
            aria-label="بستن"
          >
            ✕
          </button>
        </div>

        <form onSubmit={(e) => void handleSubmit(e)} className="p-4 space-y-3">
          {/* Board */}
          <div>
            <label className="block text-xs font-medium text-default-600 mb-1">بورد</label>
            <select
              value={boardId}
              onChange={(e) => setBoardId(Number(e.target.value))}
              className="w-full rounded-xl border border-default-300 bg-default-100 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
            >
              {boards.map((b) => (
                <option key={b.id} value={b.id}>{b.name}</option>
              ))}
            </select>
          </div>

          {/* Title */}
          <div>
            <label className="block text-xs font-medium text-default-600 mb-1">عنوان پرونده *</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="مثال: تعمیر لپ‌تاپ ایسوس"
              className="w-full rounded-xl border border-default-300 bg-default-100 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
          </div>

          {/* Customer row */}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-xs font-medium text-default-600 mb-1">نام مشتری</label>
              <input
                type="text"
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                placeholder="نام و نام خانوادگی"
                className="w-full rounded-xl border border-default-300 bg-default-100 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-default-600 mb-1">شماره موبایل</label>
              <input
                type="tel"
                value={customerPhone}
                onChange={(e) => setCustomerPhone(e.target.value)}
                placeholder="09xxxxxxxxx"
                dir="ltr"
                className="w-full rounded-xl border border-default-300 bg-default-100 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
            </div>
          </div>

          {/* Priority */}
          <div>
            <label className="block text-xs font-medium text-default-600 mb-1">اولویت</label>
            <div className="flex gap-2">
              {(['low', 'medium', 'high', 'urgent'] as ServiceJobPriority[]).map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setPriority(p)}
                  className={`flex-1 py-1.5 rounded-lg text-xs font-medium transition-colors border ${
                    priority === p
                      ? 'border-transparent text-white'
                      : 'border-default-200 text-default-600 bg-default-50 hover:bg-default-100'
                  }`}
                  style={priority === p ? { backgroundColor: PRIORITY_COLOR[p] } : undefined}
                >
                  {PRIORITY_LABEL[p]}
                </button>
              ))}
            </div>
          </div>

          {/* Description */}
          <div>
            <label className="block text-xs font-medium text-default-600 mb-1">توضیحات (اختیاری)</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              placeholder="توضیحات اضافی..."
              className="w-full rounded-xl border border-default-300 bg-default-100 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 resize-none"
            />
          </div>

          {error && (
            <p className="text-xs text-red-500 bg-red-50 dark:bg-red-950 rounded-lg px-3 py-2">{error}</p>
          )}

          <div className="flex gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2 rounded-xl border border-default-300 text-sm text-default-600 hover:bg-default-100 transition-colors"
            >
              انصراف
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="flex-1 py-2 rounded-xl bg-blue-500 text-white text-sm font-medium hover:bg-blue-600 transition-colors disabled:opacity-50"
            >
              {isSubmitting ? 'در حال ثبت...' : 'ثبت پرونده'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Job Row ──────────────────────────────────────────────────────────────────
function JobRow({ job }: { job: LocalServiceJob }) {
  const isPending = job._syncStatus === 'pending_create';
  const isFailed = job._syncStatus === 'failed';

  return (
    <div className={`flex items-start gap-3 p-3 rounded-xl border transition-colors ${
      isFailed
        ? 'border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950/30'
        : isPending
        ? 'border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/30'
        : 'border-default-200 bg-white dark:bg-zinc-900 hover:border-primary/40'
    }`}>
      <div
        className="w-1 min-h-[40px] rounded-full shrink-0 self-stretch"
        style={{ backgroundColor: PRIORITY_COLOR[job.priority] }}
      />

      <div className="flex-1 min-w-0 space-y-1.5">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            {job.jobNumber && (
              <span className="text-[10px] font-mono text-default-400 block">{job.jobNumber}</span>
            )}
            <p className="font-semibold text-sm truncate text-default-800 dark:text-default-100">{job.title}</p>
          </div>
          <div className="flex items-center gap-1.5 shrink-0 flex-wrap justify-end">
            {isPending && (
              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-200 text-amber-800 dark:bg-amber-900 dark:text-amber-200 font-medium">
                در صف
              </span>
            )}
            {isFailed && (
              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-red-200 text-red-800 dark:bg-red-900 dark:text-red-200 font-medium" title={job._syncError ?? ''}>
                ناموفق
              </span>
            )}
            {job.statusLabel && (
              <span
                className="text-[11px] px-2 py-0.5 rounded-full font-medium"
                style={
                  job.statusColor
                    ? { backgroundColor: job.statusColor + '22', color: job.statusColor }
                    : undefined
                }
              >
                {job.statusLabel}
              </span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-3 text-xs text-default-500 flex-wrap">
          {job.customerName && <span>{job.customerName}</span>}
          {job.customerPhone && <span dir="ltr" className="font-mono">{job.customerPhone}</span>}
          <span>{new Date(job.createdAt).toLocaleDateString('fa-IR')}</span>
          {job.boardName && <span>{job.boardName}</span>}
          <span style={{ color: PRIORITY_COLOR[job.priority] }}>
            {PRIORITY_LABEL[job.priority]}
          </span>
        </div>

        {job.salesInvoiceId && (
          <span className="inline-flex items-center gap-1 text-[11px] text-emerald-600 dark:text-emerald-400">
            فاکتور #{job.salesInvoiceId}
          </span>
        )}
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function ServiceJobsPage() {
  const user = useAuthStore((s) => s.user);
  const token = useAuthStore((s) => s.token);
  const restaurantId = user?.restaurants?.[0]?.id;

  const [boards, setBoards] = useState<LocalServiceBoard[]>([]);
  const [jobs, setJobs] = useState<LocalServiceJob[]>([]);
  const [selectedBoardId, setSelectedBoardId] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [filterStatus, setFilterStatus] = useState<'all' | 'intake' | 'in_progress' | 'done' | 'cancelled' | 'pending'>('all');
  const syncingRef = useRef(false);

  const loadLocal = useCallback(async () => {
    if (!restaurantId) return;
    const [localBoards, localJobs] = await Promise.all([
      getLocalServiceBoards(restaurantId),
      getLocalServiceJobs(restaurantId),
    ]);
    setBoards(localBoards);
    setJobs(localJobs);
    if (localBoards.length > 0) {
      setSelectedBoardId((prev) => prev ?? localBoards[0].id);
    }
  }, [restaurantId]);

  const doSync = useCallback(async () => {
    if (!restaurantId || !token || syncingRef.current) return;
    syncingRef.current = true;
    setIsSyncing(true);
    try {
      await runServiceJobsSync({ restaurantId, token });
      await loadLocal();
    } finally {
      syncingRef.current = false;
      setIsSyncing(false);
    }
  }, [restaurantId, token, loadLocal]);

  useEffect(() => {
    if (!restaurantId) return;
    setIsLoading(true);
    loadLocal()
      .then(() => doSync())
      .finally(() => setIsLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [restaurantId]);

  useEffect(() => {
    const handler = () => void loadLocal();
    window.addEventListener('service-jobs:synced', handler);
    return () => window.removeEventListener('service-jobs:synced', handler);
  }, [loadLocal]);

  const filteredJobs = jobs.filter((j) => {
    if (selectedBoardId && j.boardId !== selectedBoardId) return false;
    if (filterStatus === 'pending') return j._syncStatus === 'pending_create' || j._syncStatus === 'failed';
    if (filterStatus !== 'all') return j.statusCategory === filterStatus;
    return true;
  });

  const pendingCount = jobs.filter((j) => j._syncStatus !== 'synced').length;

  const FILTER_TABS = [
    { key: 'all' as const, label: 'همه' },
    { key: 'intake' as const, label: 'پذیرش' },
    { key: 'in_progress' as const, label: 'در جریان' },
    { key: 'done' as const, label: 'انجام شده' },
    { key: 'cancelled' as const, label: 'لغو شده' },
    ...(pendingCount > 0 ? [{ key: 'pending' as const, label: `در صف (${pendingCount})` }] : []),
  ];

  return (
    <div className="flex flex-col h-full overflow-hidden" dir="rtl">
      {/* Header */}
      <div className="shrink-0 border-b border-default-200 bg-white dark:bg-zinc-900 px-4 py-3 flex items-center gap-3 flex-wrap">
        <div className="flex-1 min-w-0">
          <h1 className="font-bold text-base">پرونده‌های خدمت</h1>
          <p className="text-xs text-default-500 mt-0.5">
            {jobs.length} پرونده
            {pendingCount > 0 && (
              <span className="mr-2 text-amber-600 dark:text-amber-400">· {pendingCount} در صف سینک</span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => void doSync()}
            disabled={isSyncing}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-default-200 text-xs text-default-600 hover:bg-default-100 transition-colors disabled:opacity-50"
          >
            {isSyncing ? 'در حال سینک...' : '↻ سینک'}
          </button>
          {boards.length > 0 && (
            <button
              type="button"
              onClick={() => setShowCreate(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-blue-500 text-white text-xs font-medium hover:bg-blue-600 transition-colors"
            >
              + پرونده جدید
            </button>
          )}
        </div>
      </div>

      {/* Board tabs */}
      {boards.length > 1 && (
        <div className="shrink-0 bg-white dark:bg-zinc-900 border-b border-default-200 px-3 overflow-x-auto">
          <div className="flex gap-1 py-2 min-w-max">
            <button
              type="button"
              onClick={() => setSelectedBoardId(null)}
              className={`flex-shrink-0 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                selectedBoardId === null
                  ? 'bg-blue-500 text-white'
                  : 'text-default-600 hover:bg-default-100'
              }`}
            >
              همه بوردها
            </button>
            {boards.map((b) => (
              <button
                key={b.id}
                type="button"
                onClick={() => setSelectedBoardId(b.id)}
                className={`flex-shrink-0 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                  selectedBoardId === b.id
                    ? 'bg-blue-500 text-white'
                    : 'text-default-600 hover:bg-default-100'
                }`}
              >
                {b.name}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Filter tabs */}
      <div className="shrink-0 bg-default-50 dark:bg-zinc-950 border-b border-default-200 px-3 overflow-x-auto">
        <div className="flex gap-1 py-2 min-w-max">
          {FILTER_TABS.map((tab) => {
            const count =
              tab.key === 'all'
                ? jobs.filter((j) => selectedBoardId ? j.boardId === selectedBoardId : true).length
                : tab.key === 'pending'
                ? pendingCount
                : jobs.filter((j) => (selectedBoardId ? j.boardId === selectedBoardId : true) && j.statusCategory === tab.key).length;
            return (
              <button
                key={tab.key}
                type="button"
                onClick={() => setFilterStatus(tab.key)}
                className={`flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs transition-colors ${
                  filterStatus === tab.key
                    ? 'bg-blue-500 text-white font-medium'
                    : 'bg-white dark:bg-zinc-900 text-zinc-600 dark:text-zinc-300 border border-zinc-200 dark:border-zinc-700 hover:border-blue-300'
                }`}
              >
                {tab.label}
                {count > 0 && (
                  <span className={`text-[10px] px-1 rounded-full ${
                    filterStatus === tab.key ? 'bg-white/20' : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-500'
                  }`}>
                    {count}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-16 text-default-400">
            <p className="text-sm">در حال بارگذاری...</p>
          </div>
        ) : boards.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-default-400 text-center">
            <p className="font-medium text-sm">هنوز بوردی تعریف نشده</p>
            <p className="text-xs mt-1">ابتدا از پنل وب یک بورد خدمت ایجاد کنید</p>
          </div>
        ) : filteredJobs.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-default-400 text-center">
            <p className="font-medium text-sm">پرونده‌ای یافت نشد</p>
            <p className="text-xs mt-1">پرونده جدید ثبت کنید یا فیلتر را تغییر دهید</p>
          </div>
        ) : (
          filteredJobs.map((job) => <JobRow key={job.id} job={job} />)
        )}
      </div>

      {showCreate && boards.length > 0 && restaurantId && (
        <CreateJobModal
          boards={boards}
          restaurantId={restaurantId}
          onClose={() => setShowCreate(false)}
          onCreated={(job) => {
            setJobs((prev) => [job, ...prev]);
            setShowCreate(false);
            void doSync();
          }}
        />
      )}
    </div>
  );
}
