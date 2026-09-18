import { useState } from 'react';
import {
  DndContext,
  DragEndEvent,
  DragOverlay,
  DragStartEvent,
  PointerSensor,
  useSensor,
  useSensors,
  closestCorners,
  useDroppable,
} from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { JobCard, JobCardOverlay } from './JobCard';
import type { LocalBoardStatus, LocalServiceJob } from '../../services/serviceJobsLocalDb';

const CATEGORY_BG: Record<string, string> = {
  intake: 'bg-sky-50 dark:bg-sky-950/20',
  in_progress: 'bg-amber-50 dark:bg-amber-950/20',
  done: 'bg-emerald-50 dark:bg-emerald-950/20',
  cancelled: 'bg-default-soft',
};

function KanbanColumn({
  status,
  jobs,
  opStates,
  onJobClick,
  onAddJob,
  canCreate,
}: {
  status: LocalBoardStatus;
  jobs: LocalServiceJob[];
  opStates: Map<number, { hasPending: boolean; hasFailed: boolean }>;
  onJobClick: (job: LocalServiceJob) => void;
  onAddJob: (statusId: number) => void;
  canCreate: boolean;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: `col-${status.id}`, data: { type: 'column', statusId: status.id } });
  const wipExceeded = status.wipLimit !== null && jobs.length >= status.wipLimit;

  return (
    <div
      className={`flex-shrink-0 w-72 flex flex-col rounded-2xl border border-border ${CATEGORY_BG[status.category] ?? 'bg-default-soft'} transition-colors ${isOver ? 'ring-2 ring-accent' : ''}`}
      style={status.color ? { borderColor: status.color } : undefined}
    >
      <div className="flex items-center justify-between px-3 pt-3 pb-2">
        <div className="flex items-center gap-2 min-w-0">
          {status.color && <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: status.color }} />}
          <span className="font-semibold text-sm text-foreground/80 truncate">{status.label}</span>
          <span className={`text-xs px-1.5 py-0.5 rounded-full font-mono ${wipExceeded ? 'bg-danger-soft text-danger' : 'bg-default/80 text-muted'}`}>
            {jobs.length}{status.wipLimit !== null ? `/${status.wipLimit}` : ''}
          </span>
        </div>
        {canCreate && (
          <button onClick={() => onAddJob(status.id)} className="text-muted hover:text-accent transition-colors p-0.5 rounded text-lg leading-none" title="افزودن پرونده">
            +
          </button>
        )}
      </div>

      <div ref={setNodeRef} className="flex-1 overflow-y-auto px-2 pb-2 space-y-2 min-h-[120px]">
        <SortableContext items={jobs.map((j) => j.id)} strategy={verticalListSortingStrategy}>
          {jobs.map((job) => (
            <JobCard key={job.id} job={job} opState={opStates.get(job.id)} onClick={() => onJobClick(job)} />
          ))}
        </SortableContext>
        {jobs.length === 0 && (
          <div className="flex flex-col items-center justify-center py-8 text-muted">
            <span className="text-xs">خالی</span>
          </div>
        )}
      </div>
    </div>
  );
}

interface KanbanBoardProps {
  statuses: LocalBoardStatus[];
  jobs: LocalServiceJob[];
  opStates: Map<number, { hasPending: boolean; hasFailed: boolean }>;
  onJobClick: (job: LocalServiceJob) => void;
  onJobMove: (jobId: number, newStatus: LocalBoardStatus) => void;
  onAddJob: (statusId: number) => void;
  canCreate: boolean;
}

export function KanbanBoard({ statuses, jobs, opStates, onJobClick, onJobMove, onAddJob, canCreate }: KanbanBoardProps) {
  const [activeJob, setActiveJob] = useState<LocalServiceJob | null>(null);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));
  const sortedStatuses = [...statuses].sort((a, b) => a.order - b.order);

  const jobsByStatus: Record<number, LocalServiceJob[]> = {};
  for (const s of sortedStatuses) jobsByStatus[s.id] = jobs.filter((j) => j.statusId === s.id);

  function handleDragStart(event: DragStartEvent) {
    if (event.active.data.current?.type === 'job') setActiveJob(event.active.data.current.job);
  }

  function handleDragEnd(event: DragEndEvent) {
    setActiveJob(null);
    const { active, over } = event;
    if (!over) return;
    const activeId = active.id as number;
    const overId = String(over.id);

    let newStatus: LocalBoardStatus | undefined;
    if (overId.startsWith('col-')) {
      const newStatusId = parseInt(overId.replace('col-', ''), 10);
      newStatus = sortedStatuses.find((s) => s.id === newStatusId);
    } else {
      const targetJob = jobs.find((j) => j.id === (over.id as number));
      if (targetJob) newStatus = sortedStatuses.find((s) => s.id === targetJob.statusId);
    }
    if (!newStatus) return;
    const job = jobs.find((j) => j.id === activeId);
    if (job && job.statusId !== newStatus.id) onJobMove(activeId, newStatus);
  }

  return (
    <DndContext sensors={sensors} collisionDetection={closestCorners} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
      <div className="flex gap-4 overflow-x-auto pb-4 pt-1 px-1" dir="rtl">
        {sortedStatuses.map((status) => (
          <KanbanColumn
            key={status.id}
            status={status}
            jobs={jobsByStatus[status.id] ?? []}
            opStates={opStates}
            onJobClick={onJobClick}
            onAddJob={onAddJob}
            canCreate={canCreate}
          />
        ))}
        {sortedStatuses.length === 0 && (
          <div className="flex flex-col items-center justify-center w-full py-20 text-muted">
            <p className="text-sm">هنوز وضعیتی تعریف نشده</p>
          </div>
        )}
      </div>
      <DragOverlay>{activeJob && <JobCardOverlay job={activeJob} />}</DragOverlay>
    </DndContext>
  );
}
