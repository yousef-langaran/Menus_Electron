/**
 * هشدار صوتی کوتاه برای نمایشگر آشپزخانه (KDS) — بدون فایل صوتی، صرفاً با
 * Web Audio API (اسیلاتور)، تا هیچ asset اضافه‌ای لازم نباشد و اندازهٔ بسته
 * تغییر نکند. مستقل از mute بودن است — بررسی mute بر عهدهٔ فراخوان (Kds.tsx)
 * است تا بشود همان state را برای UI هم استفاده کرد.
 */

type AudioContextCtor = typeof AudioContext;

let sharedAudioContext: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  const Ctor: AudioContextCtor | undefined =
    window.AudioContext || (window as unknown as { webkitAudioContext?: AudioContextCtor }).webkitAudioContext;
  if (!Ctor) return null;
  if (!sharedAudioContext || sharedAudioContext.state === 'closed') {
    try {
      sharedAudioContext = new Ctor();
    } catch (error) {
      console.error('[KDS] Failed to create AudioContext:', error);
      return null;
    }
  }
  return sharedAudioContext;
}

function beep(frequency: number, durationMs: number, delayMs = 0): void {
  const ctx = getAudioContext();
  if (!ctx) return;
  try {
    const startAt = ctx.currentTime + delayMs / 1000;
    const oscillator = ctx.createOscillator();
    const gain = ctx.createGain();
    oscillator.type = 'sine';
    oscillator.frequency.value = frequency;
    gain.gain.setValueAtTime(0.0001, startAt);
    gain.gain.exponentialRampToValueAtTime(0.3, startAt + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, startAt + durationMs / 1000);
    oscillator.connect(gain);
    gain.connect(ctx.destination);
    oscillator.start(startAt);
    oscillator.stop(startAt + durationMs / 1000 + 0.05);
  } catch (error) {
    console.error('[KDS] Failed to play audio cue:', error);
  }
}

/** دو بیپ کوتاه صعودی — هنگام رسیدن سفارش جدید */
export function playKdsNewOrderChime(): void {
  beep(880, 120, 0);
  beep(1175, 140, 150);
}

/** دو بیپ یکنواخت پایین‌تر — سفارش از آستانهٔ زمان‌سنج عبور کرده */
export function playKdsAgingAlertChime(): void {
  beep(660, 220, 0);
  beep(660, 220, 260);
}
