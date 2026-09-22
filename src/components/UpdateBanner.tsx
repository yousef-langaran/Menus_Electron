import { useEffect, useRef, useState } from 'react';

type DownloadProgress = { percent: number; bytesPerSecond: number; transferred: number; total: number };

type UpdateState =
  | { status: 'idle' }
  | { status: 'available'; version: string }
  | { status: 'downloading'; progress: DownloadProgress | null }
  | { status: 'downloaded' }
  | { status: 'error'; message: string };

function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return '0 مگابایت';
  const mb = bytes / (1024 * 1024);
  if (mb < 1024) return `${mb.toFixed(1)} مگابایت`;
  return `${(mb / 1024).toFixed(2)} گیگابایت`;
}

function formatSpeed(bytesPerSecond: number): string {
  return `${formatBytes(bytesPerSecond)}/ثانیه`;
}

function formatEta(secondsRemaining: number): string {
  if (!Number.isFinite(secondsRemaining) || secondsRemaining < 0) return '';
  const totalSeconds = Math.round(secondsRemaining);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes <= 0) return `${seconds} ثانیه`;
  return `${minutes} دقیقه و ${seconds} ثانیه`;
}

export function UpdateBanner() {
  const [state, setState] = useState<UpdateState>({ status: 'idle' });
  const api = typeof window !== 'undefined' ? (window as any).electronAPI : null;
  const stateRef = useRef(state);
  stateRef.current = state;

  useEffect(() => {
    if (!api?.onUpdateAvailable || !api?.onUpdateDownloaded || !api?.onUpdateError) return;

    const unsubAvailable = api.onUpdateAvailable((info: { version: string }) => {
      setState({ status: 'available', version: info.version });
    });
    const unsubProgress = api.onUpdateDownloadProgress?.((progress: DownloadProgress) => {
      if (stateRef.current.status === 'available' || stateRef.current.status === 'downloading') {
        setState({ status: 'downloading', progress });
      }
    });
    const unsubDownloaded = api.onUpdateDownloaded(() => {
      setState({ status: 'downloaded' });
    });
    const unsubError = api.onUpdateError((message: string) => {
      setState({ status: 'error', message });
    });

    return () => {
      unsubAvailable?.();
      unsubProgress?.();
      unsubDownloaded?.();
      unsubError?.();
    };
  }, [api]);

  const handleDownload = () => {
    if (!api?.startUpdateDownload) return;
    setState((s) => (s.status === 'available' ? { status: 'downloading', progress: null } : s));
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

  if (state.status === 'available') {
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
        <span>{`نسخه جدید (${state.version}) موجود است.`}</span>
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
      </div>
    );
  }

  if (state.status === 'downloading') {
    const progress = state.progress;
    const percent = progress ? Math.max(0, Math.min(100, progress.percent)) : 0;
    const remainingBytes = progress ? Math.max(0, progress.total - progress.transferred) : 0;
    const etaSeconds =
      progress && progress.bytesPerSecond > 0 ? remainingBytes / progress.bytesPerSecond : NaN;

    return (
      <div
        style={{
          padding: '10px 16px',
          background: '#dbeafe',
          color: '#1e40af',
          fontSize: '14px',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '6px',
        }}
      >
        <span>در حال دانلود بروزرسانی... {progress ? `${percent.toFixed(0)}٪` : ''}</span>
        <div
          style={{
            width: '100%',
            maxWidth: '420px',
            height: '8px',
            borderRadius: '4px',
            background: '#bfdbfe',
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              width: `${percent}%`,
              height: '100%',
              background: '#2563eb',
              borderRadius: '4px',
              transition: 'width 0.2s ease',
            }}
          />
        </div>
        {progress && (
          <span style={{ fontSize: '12px', color: '#1e3a8a' }}>
            {formatBytes(progress.transferred)} از {formatBytes(progress.total)} · {formatSpeed(progress.bytesPerSecond)}
            {Number.isFinite(etaSeconds) && etaSeconds > 0 ? ` · باقی‌مانده: ${formatEta(etaSeconds)}` : ''}
          </span>
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
