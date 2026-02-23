import { useEffect, useState } from 'react';

type UpdateState = 
  | { status: 'idle' }
  | { status: 'available'; version: string }
  | { status: 'downloading' }
  | { status: 'downloaded' }
  | { status: 'error'; message: string };

export function UpdateBanner() {
  const [state, setState] = useState<UpdateState>({ status: 'idle' });
  const api = typeof window !== 'undefined' ? (window as any).electronAPI : null;

  useEffect(() => {
    if (!api?.onUpdateAvailable || !api?.onUpdateDownloaded || !api?.onUpdateError) return;

    const unsubAvailable = api.onUpdateAvailable((info: { version: string }) => {
      setState({ status: 'available', version: info.version });
    });
    const unsubDownloaded = api.onUpdateDownloaded(() => {
      setState({ status: 'downloaded' });
    });
    const unsubError = api.onUpdateError((message: string) => {
      setState({ status: 'error', message });
    });

    return () => {
      unsubAvailable?.();
      unsubDownloaded?.();
      unsubError?.();
    };
  }, [api]);

  const handleDownload = () => {
    if (!api?.startUpdateDownload) return;
    setState((s) => (s.status === 'available' ? { status: 'downloading' } : s));
    api.startUpdateDownload();
  };

  const handleQuitAndInstall = () => {
    api?.quitAndInstall?.();
  };

  if (!api || state.status === 'idle') return null;

  if (state.status === 'error') {
    return (
      <div
        style={{
          padding: '8px 16px',
          background: '#fef2f2',
          color: '#991b1b',
          fontSize: '14px',
          textAlign: 'center',
        }}
      >
        خطا در بروزرسانی: {state.message}
      </div>
    );
  }

  if (state.status === 'available' || state.status === 'downloading') {
    return (
      <div
        style={{
          padding: '10px 16px',
          background: '#dbeafe',
          color: '#1e40af',
          fontSize: '14px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '12px',
          flexWrap: 'wrap',
        }}
      >
        <span>
          {state.status === 'downloading'
            ? 'در حال دانلود بروزرسانی...'
            : `نسخه جدید (${state.version}) موجود است.`}
        </span>
        {state.status === 'available' && (
          <button
            type="button"
            onClick={handleDownload}
            style={{
              padding: '6px 14px',
              background: '#2563eb',
              color: '#fff',
              border: 'none',
              borderRadius: '6px',
              cursor: 'pointer',
              fontWeight: 600,
            }}
          >
            بروزرسانی
          </button>
        )}
      </div>
    );
  }

  if (state.status === 'downloaded') {
    return (
      <div
        style={{
          padding: '10px 16px',
          background: '#dcfce7',
          color: '#166534',
          fontSize: '14px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '12px',
          flexWrap: 'wrap',
        }}
      >
        <span>بروزرسانی دانلود شد.</span>
        <button
          type="button"
          onClick={handleQuitAndInstall}
          style={{
            padding: '6px 14px',
            background: '#16a34a',
            color: '#fff',
            border: 'none',
            borderRadius: '6px',
            cursor: 'pointer',
            fontWeight: 600,
          }}
        >
          راه‌اندازی مجدد برای نصب
        </button>
      </div>
    );
  }

  return null;
}
