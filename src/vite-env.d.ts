/// <reference types="vite/client" />

import type { ElectronAPI } from '../electron/preload';

interface ImportMetaEnv {
  readonly VITE_API_BASE_URL?: string;
  readonly VITE_API_BASE_VERSION?: string;
  readonly NEXT_PUBLIC_API_BASE_URL?: string;
  readonly NEXT_PUBLIC_API_BASE_VERSION?: string;
  readonly API_BASE_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

declare global {
  interface Window {
    // The real shape is inferred from the actual object passed to
    // contextBridge.exposeInMainWorld('electronAPI', ...) in electron/preload.ts,
    // so this can never drift out of sync with the ~77 methods actually exposed.
    electronAPI?: ElectronAPI;
  }
}

export {};

