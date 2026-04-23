import { create } from 'zustand';

type SyncState = {
  isOnline: boolean;
  isSyncing: boolean;
  pendingOps: number;
  failedOps: number;
  lastSyncedAt: string | null;
  lastError: string | null;
  setOnline: (isOnline: boolean) => void;
  setSyncing: (isSyncing: boolean) => void;
  setQueueState: (pendingOps: number, failedOps: number) => void;
  setLastSyncedAt: (value: string | null) => void;
  setLastError: (value: string | null) => void;
};

export const useSyncStore = create<SyncState>((set) => ({
  isOnline: true,
  isSyncing: false,
  pendingOps: 0,
  failedOps: 0,
  lastSyncedAt: null,
  lastError: null,
  setOnline: (isOnline) => set({ isOnline }),
  setSyncing: (isSyncing) => set({ isSyncing }),
  setQueueState: (pendingOps, failedOps) => set({ pendingOps, failedOps }),
  setLastSyncedAt: (lastSyncedAt) => set({ lastSyncedAt }),
  setLastError: (lastError) => set({ lastError }),
}));
