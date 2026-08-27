/**
 * اعلان فراخوان گارسون روی پنل دسکتاپ.
 *
 * رویدادهای سوکت به رویداد DOM تبدیل می‌شوند تا هر صفحه‌ای (کارتابل فراخوان،
 * لیست سفارش‌ها، KDS) بتواند بدون باز کردن اتصال دوم به آن گوش بدهد؛ اعلان
 * سیستمی و بوق فقط یک‌بار و همین‌جا زده می‌شود تا با سوئیچ بین صفحه‌ها
 * تکراری نشود.
 */

const TYPE_LABELS: Record<string, string> = {
  waiter: 'صدا زدن گارسون',
  bill: 'درخواست صورتحساب',
  water: 'آب / نوشیدنی',
  cleaning: 'جمع‌آوری میز',
  order: 'آماده‌ام سفارش بدهم',
  other: 'درخواست دیگر',
};

let audioContext: AudioContext | null = null;

/** بوق کوتاه بدون فایل صوتی — پشت پیشخوان شلوغ باید شنیده شود */
const playBeep = () => {
  try {
    if (typeof window === 'undefined') return;
    const Ctor = window.AudioContext || (window as any).webkitAudioContext;
    if (!Ctor) return;
    if (!audioContext) audioContext = new Ctor();
    if (audioContext.state === 'suspended') void audioContext.resume();

    const now = audioContext.currentTime;
    [0, 0.18].forEach((offset, index) => {
      const oscillator = audioContext!.createOscillator();
      const gain = audioContext!.createGain();
      oscillator.type = 'sine';
      oscillator.frequency.value = index === 0 ? 880 : 1174;
      gain.gain.setValueAtTime(0.0001, now + offset);
      gain.gain.exponentialRampToValueAtTime(0.3, now + offset + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + offset + 0.15);
      oscillator.connect(gain);
      gain.connect(audioContext!.destination);
      oscillator.start(now + offset);
      oscillator.stop(now + offset + 0.16);
    });
  } catch {
    // صدا هرگز نباید جریان اعلان را بشکند
  }
};

const showDesktopNotification = (title: string, body: string) => {
  try {
    if (typeof Notification === 'undefined') {
      window.electronAPI?.showMessageBox?.({ type: 'info', title, message: body });
      return;
    }
    if (Notification.permission === 'granted') {
      const notification = new Notification(title, { body });
      notification.onclick = () => window.focus();
      return;
    }
    if (Notification.permission !== 'denied') {
      void Notification.requestPermission().then((result) => {
        if (result === 'granted') {
          const notification = new Notification(title, { body });
          notification.onclick = () => window.focus();
        }
      });
    }
  } catch {
    // نادیده — اعلان درون‌برنامه‌ای همچنان از طریق رویداد DOM می‌رسد
  }
};

export const handleIncomingWaiterCall = (call: any): void => {
  if (typeof window === 'undefined') return;

  window.dispatchEvent(new CustomEvent('waiter-calls:new', { detail: call }));

  const typeLabel = call?.typeLabel || TYPE_LABELS[call?.type] || 'درخواست جدید';
  const title = `فراخوان میز ${call?.tableName ?? ''}`.trim();
  const body = [typeLabel, call?.note].filter(Boolean).join(' • ');

  playBeep();
  showDesktopNotification(title || 'فراخوان گارسون', body || 'مشتری درخواست جدیدی ثبت کرد');
};

export const handleUpdatedWaiterCall = (call: any): void => {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent('waiter-calls:updated', { detail: call }));
};
