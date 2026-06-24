import { useCallback, useEffect, useState } from 'react';
import { useAuthStore } from '../store/authStore';
import { Button } from '../ui/compat-button';
import { Input } from '../ui/compat-input';
import { KanbanBoard } from '../components/serviceJobs/KanbanBoard';
import { CreateJobModal } from '../components/serviceJobs/CreateJobModal';
import { JobDetailPanel } from '../components/serviceJobs/JobDetailPanel';
import {
  getLocalServiceBoards,
  getLocalServiceJobs,
  getOpsStateMap,
  getPendingServiceJobsCount,
  moveServiceJobLocal,
  type LocalServiceBoard,
  type LocalServiceJob,
} from '../services/serviceJobsLocalDb';
import { runServiceJobsSync } from '../services/serviceJobsSync';
import { toast } from '../utils/toast';

export default function ServiceJobsPage() {
  const user = useAuthStore((s) => s.user);
  const token = useAuthStore((s) => s.token);
  const restaurantId = user?.restaurants?.[0]?.id;

  const [boards, setBoards] = useState<LocalServiceBoard[]>([]);
  const [jobs, setJobs] = useState<LocalServiceJob[]>([]);
  const [opStates, setOpStates] = useState<Map<number, { hasPending: boolean; hasFailed: boolean }>>(new Map());
  const [selectedBoardId, setSelectedBoardId] = useState<number | null>(null);
  const [search, setSearch] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [pendingCount, setPendingCount] = useState({ pendingCount: 0, failedCount: 0 });
  const [showCreate, setShowCreate] = useState(false);
  const [createStatusId, setCreateStatusId] = useState<number | undefined>();
  const [openJob, setOpenJob] = useState<LocalServiceJob | null>(null);

  const loadLocal = useCallback(async () => {
    if (!restaurantId) return;
    const [localBoards, localJobs, ops, counts] = await Promise.all([
      getLocalServiceBoards(restaurantId),
      getLocalServiceJobs(restaurantId),
      getOpsStateMap(restaurantId),
      getPendingServiceJobsCount(restaurantId),
    ]);
    setBoards(localBoards);
    setJobs(localJobs);
    setOpStates(ops);
    setPendingCount(counts);
    if (localBoards.length > 0) setSelectedBoardId((prev) => prev ?? localBoards[0].id);
  }, [restaurantId]);

  const doSync = useCallback(async () => {
    if (!restaurantId || !token) return;
    setIsSyncing(true);
    try {
      await runServiceJobsSync({ restaurantId, token });
      await loadLocal();
    } finally {
      setIsSyncing(false);
    }
  }, [restaurantId, token, loadLocal]);

  useEffect(() => {
    if (!restaurantId) return;
    setIsLoading(true);
    loadLocal().then(() => doSync()).finally(() => setIsLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [restaurantId]);

  useEffect(() => {
    const handler = () => void loadLocal();
    window.addEventListener('service-jobs:synced', handler);
    return () => window.removeEventListener('service-jobs:synced', handler);
  }, [loadLocal]);

  const selectedBoard = boards.find((b) => b.id === selectedBoardId) ?? null;

  const boardJobs = jobs.filter((j) => {
    if (selectedBoardId && j.boardId !== selectedBoardId) return false;
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      return (
        j.title.toLowerCase().includes(q) ||
        (j.customerName ?? '').toLowerCase().includes(q) ||
        (j.customerPhone ?? '').includes(q) ||
        (j.jobNumber ?? '').toLowerCase().includes(q)
      );
    }
    return true;
  });

  const handleJobMove = async (jobId: number, newStatus: LocalServiceBoard['statuses'][number]) => {
    setJobs((prev) => prev.map((j) => (j.id === jobId ? { ...j, statusId: newStatus.id, statusLabel: newStatus.label, statusColor: newStatus.color, statusCategory: newStatus.category } : j)));
    await moveServiceJobLocal(jobId, newStatus);
    await loadLocal();
    void doSync(); // اگر آنلاینیم، بدون تأخیر تا ۶۰ ثانیه‌ای، همین الان push شود
  };

  if (!restaurantId) return null;

  return (
    <div className="flex flex-col h-full overflow-hidden" dir="rtl">
      {/* Header */}
      <div className="shrink-0 border-b border-default-200 bg-content1 px-4 py-3 flex items-center gap-3 flex-wrap">
        <h1 className="font-bold text-base shrink-0">پرونده‌های خدمت</h1>
        {pendingCount.pendingCount + pendingCount.failedCount > 0 && (
          <span className={`text-xs px-2 py-0.5 rounded-full ${pendingCount.failedCount > 0 ? 'bg-danger-100 text-danger-700' : 'bg-warning-100 text-warning-700'}`}>
            {pendingCount.failedCount > 0 ? `${pendingCount.failedCount} ناموفق` : `${pendingCount.pendingCount} در صف سینک`}
          </span>
        )}
        <div className="flex-1 min-w-[160px] max-w-xs">
          <Input placeholder="جستجو در پرونده‌ها…" value={search} onValueChange={setSearch} />
        </div>
        <Button size="sm" variant="flat" onPress={() => void doSync()} isLoading={isSyncing}>سینک</Button>
        {selectedBoard && (
          <Button size="sm" color="primary" onPress={() => { setCreateStatusId(undefined); setShowCreate(true); }}>
            پرونده جدید
          </Button>
        )}
      </div>

      {/* Board tabs */}
      {boards.length > 1 && (
        <div className="shrink-0 bg-content1 border-b border-default-200 px-3 overflow-x-auto">
          <div className="flex gap-1 py-2 min-w-max">
            {boards.map((b) => (
              <button
                key={b.id}
                onClick={() => setSelectedBoardId(b.id)}
                className={`flex-shrink-0 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                  selectedBoardId === b.id ? 'bg-primary-500 text-white' : 'text-default-600 hover:bg-default-100'
                }`}
              >
                {b.icon ? `${b.icon} ` : ''}{b.name}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Kanban */}
      <div className="flex-1 overflow-auto bg-default-50 p-4">
        {isLoading ? (
          <p className="text-sm text-default-400 text-center py-16">در حال بارگذاری…</p>
        ) : boards.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-default-400 text-center">
            <p className="font-medium text-sm">هنوز بوردی تعریف نشده</p>
            <p className="text-xs mt-1">ابتدا از پنل وب یک بورد خدمت ایجاد کنید</p>
          </div>
        ) : !selectedBoard ? null : (
          <KanbanBoard
            statuses={selectedBoard.statuses}
            jobs={boardJobs}
            opStates={opStates}
            onJobClick={setOpenJob}
            onJobMove={handleJobMove}
            onAddJob={(statusId) => { setCreateStatusId(statusId); setShowCreate(true); }}
            canCreate
          />
        )}
      </div>

      {showCreate && selectedBoard && token && (
        <CreateJobModal
          isOpen={showCreate}
          onClose={() => setShowCreate(false)}
          board={selectedBoard}
          defaultStatusId={createStatusId}
          restaurantId={restaurantId}
          token={token}
          onCreated={() => { void loadLocal(); void doSync(); toast.success('پرونده ثبت شد'); }}
        />
      )}

      {openJob && selectedBoard && token && (
        <JobDetailPanel
          job={openJob}
          board={boards.find((b) => b.id === openJob.boardId) ?? selectedBoard}
          restaurantId={restaurantId}
          token={token}
          onClose={() => { setOpenJob(null); void loadLocal(); }}
          onUpdated={() => { void loadLocal(); void doSync(); }}
        />
      )}
    </div>
  );
}
