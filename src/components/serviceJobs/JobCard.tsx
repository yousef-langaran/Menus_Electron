import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { LocalServiceJob } from '../../services/serviceJobsLocalDb';

const PRIORITY_LABEL: Record<string, string> = { low: 'کم', normal: 'معمولی', high: 'زیاد', urgent: 'فوری' };
const PRIORITY_COLOR: Record<string, string> = { low: '#6b7280', normal: '#3b82f6', high: '#f59e0b', urgent: '#ef4444' };

interface JobCardProps {
  job: LocalServiceJob;
  opState?: { hasPending: boolean; hasFailed: boolean };
  onClick: () => void;
}

export function JobCard({ job, opState, onClick }: JobCardProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: job.id,
    data: { type: 'job', job },
  });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    cursor: isDragging ? 'grabbing' : 'grab',
  };

  const isOverdue = job.dueDate && !job.closedAt && new Date(job.dueDate) < new Date();

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      onClick={() => { if (!isDragging) onClick(); }}
      className={`bg-surface rounded-xl border shadow-sm hover:shadow-md transition-shadow select-none p-3 space-y-2 ${
        opState?.hasFailed ? 'border-danger/40' : opState?.hasPending ? 'border-warning/40' : 'border-border'
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-foreground/90 line-clamp-2 leading-snug">{job.title}</p>
          {job.jobNumber && <p className="text-xs text-muted mt-0.5 font-mono">{job.jobNumber}</p>}
        </div>
        <span
          className="mt-0.5 w-2 h-2 rounded-full flex-shrink-0"
          style={{ backgroundColor: PRIORITY_COLOR[job.priority] }}
          title={PRIORITY_LABEL[job.priority]}
        />
      </div>

      <div className="flex items-center justify-between pt-1">
        <div className="flex items-center gap-1.5 min-w-0">
          {(job.customerName || job.customerPhone) && (
            <span className="text-xs text-muted truncate max-w-[100px]">
              {job.customerName || job.customerPhone}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1.5 flex-shrink-0">
          {opState?.hasFailed && (
            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-danger-soft text-danger-soft-foreground">ناموفق</span>
          )}
          {opState?.hasPending && !opState?.hasFailed && (
            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-warning-soft text-warning-soft-foreground">در صف</span>
          )}
          {job.dueDate && (
            <span className={`text-xs px-1.5 py-0.5 rounded-md ${isOverdue ? 'bg-danger-soft text-danger' : 'bg-default-soft text-muted'}`}>
              {new Date(job.dueDate).toLocaleDateString('fa-IR', { month: 'short', day: 'numeric' })}
            </span>
          )}
          {job.estimatedAmount > 0 && (
            <span className="text-xs text-muted font-mono">
              {Math.round(job.estimatedAmount / 10).toLocaleString('fa-IR')}ت
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

export function JobCardOverlay({ job }: { job: LocalServiceJob }) {
  return (
    <div className="bg-surface rounded-xl border border-accent/60 shadow-xl p-3 w-64 rotate-2 opacity-90">
      <p className="text-sm font-medium text-foreground/90 line-clamp-2">{job.title}</p>
      {job.jobNumber && <p className="text-xs text-muted mt-0.5 font-mono">{job.jobNumber}</p>}
    </div>
  );
}
