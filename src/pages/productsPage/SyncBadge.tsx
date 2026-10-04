import type { LocalProduct } from '../../services/catalogLocalDb';

export function SyncBadge({
  status,
  error,
}: {
  status: LocalProduct['_syncStatus'];
  error?: string | null;
}) {
  if (status === 'synced') return null;
  if (status === 'pending_create' || status === 'pending_update') {
    return (
      <span className="text-xs bg-warning-soft text-warning-soft-foreground border border-warning/40 px-2 py-0.5 rounded-full">
        در انتظار سینک
      </span>
    );
  }
  return (
    <span
      className="text-xs bg-danger-soft text-danger-soft-foreground border border-danger/40 px-2 py-0.5 rounded-full"
      title={error ?? ''}
    >
      خطای سینک
    </span>
  );
}
