import { spawn } from 'child_process';
import * as readline from 'readline';

/**
 * اتصال به کارتخوان آسان‌پرداخت کیش از طریق `PosInterface.dll` (SDK رسمی شرکت).
 * چون DLL یک اسمبلی .NET معمولی است (نه COM)، به‌جای فراخوانی مستقیم از Node، یک
 * میان‌واسط کنسول کوچک C# (`PosBridge.exe` — سورس در electron/native/pos-bridge-src)
 * آن را رفرنس می‌گیرد و از طریق خطوط JSON روی stdin/stdout با این سرویس صحبت می‌کند.
 * هر پرداخت یک پروسه‌ی مجزای PosBridge اجرا می‌کند (init → payment → exit) — مشابه
 * الگوی samanPos.ts که هر بار یک اتصال سریال تازه باز می‌کند.
 */

export type AsanPardakhtConnectionMode = 'lan' | 'serial';

export interface AsanPardakhtConnectionOptions {
  mode: AsanPardakhtConnectionMode;
  ip?: string;
  port?: number;
  comPort?: string;
  baudRate?: number;
  /** مسیر PosBridge.exe (با getAssetPath از main.ts محاسبه می‌شود) */
  bridgeExePath: string;
  /** حداکثر زمان انتظار برای پاسخ نهایی تراکنش */
  timeoutMs?: number;
}

export interface AsanPardakhtPaymentResult {
  success: boolean;
  error?: string;
  errorCode?: number;
  amount?: string;
  rrn?: string;
  stan?: string;
  dateTime?: string;
  merchantId?: string;
  terminalId?: string;
  cardNumber?: string;
  invoiceNumber?: string;
}

function maskCardNumber(pan?: string): string | undefined {
  if (!pan || pan.length < 10) return pan;
  return `${pan.slice(0, 6)}******${pan.slice(-4)}`;
}

/** پیام مبلغ را از طریق PosBridge (LAN یا سریال) به کارتخوان آسان‌پرداخت می‌فرستد و منتظر پاسخ می‌ماند */
export async function sendPaymentViaAsanPardakht(
  amountRial: number,
  connection: AsanPardakhtConnectionOptions,
  opts: { invoiceNumber?: string; tashim?: string } = {},
): Promise<AsanPardakhtPaymentResult> {
  return new Promise((resolve) => {
    let settled = false;
    let child: ReturnType<typeof spawn>;

    const finish = (result: AsanPardakhtPaymentResult) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try {
        child?.stdin?.write(JSON.stringify({ cmd: 'exit' }) + '\n');
      } catch {
        /* ignore */
      }
      setTimeout(() => {
        try {
          if (child && !child.killed) child.kill();
        } catch {
          /* ignore */
        }
      }, 500);
      resolve(result);
    };

    try {
      child = spawn(connection.bridgeExePath, [], { windowsHide: true });
    } catch (err: any) {
      resolve({ success: false, error: `اجرای PosBridge ناموفق بود: ${String(err?.message || err)}` });
      return;
    }

    const timer = setTimeout(() => {
      finish({ success: false, error: 'زمان انتظار برای پاسخ کارتخوان به پایان رسید' });
    }, connection.timeoutMs || 90000);

    let initSent = false;
    const rl = readline.createInterface({ input: child.stdout! });

    rl.on('line', (line: string) => {
      let msg: any;
      try {
        msg = JSON.parse(line);
      } catch {
        return;
      }

      if (msg.type === 'ready' && !initSent) {
        initSent = true;
        const initCmd =
          connection.mode === 'serial'
            ? { cmd: 'init', mode: 'serial', comPort: connection.comPort, baudRate: connection.baudRate }
            : { cmd: 'init', mode: 'lan', ip: connection.ip, port: connection.port };
        child.stdin!.write(JSON.stringify(initCmd) + '\n');
        return;
      }

      if (msg.type === 'initDone') {
        if (!msg.success) {
          finish({ success: false, error: msg.error || 'اتصال به کارتخوان ناموفق بود' });
          return;
        }
        const paymentCmd = {
          cmd: 'payment',
          amount: String(Math.max(0, Math.round(amountRial))),
          tashim: opts.tashim || '1',
          invoiceNumber: opts.invoiceNumber || '',
        };
        child.stdin!.write(JSON.stringify(paymentCmd) + '\n');
        return;
      }

      if (msg.type === 'transactionDone') {
        const r = msg.result || {};
        const errorCode = Number(r.errorCode);
        // ⚠️ فرض بر این‌که ErrorCode==0 یعنی موفق (قرارداد رایج پیام‌های ISO8583 در سوییچ‌های
        // ایرانی). این کد مستقیماً از پاسخ خام دستگاه parse می‌شود؛ جدول کامل کدها را نداریم،
        // پس پیش از اتکا در تراکنش واقعی حتماً با دستگاه/شبیه‌ساز واقعی تست شود.
        const success = errorCode === 0;
        finish({
          success,
          error: success ? undefined : r.errorMsg || 'تراکنش توسط کارتخوان ناموفق اعلام شد',
          errorCode,
          amount: r.paymentAmount,
          rrn: r.rrn,
          stan: r.stan,
          dateTime: r.dateTime,
          merchantId: r.merchantId,
          terminalId: r.terminalId,
          cardNumber: maskCardNumber(r.cardNumber),
          invoiceNumber: r.invoiceNumber,
        });
        return;
      }

      if (msg.type === 'error') {
        finish({ success: false, error: msg.error || 'خطای نامشخص کارتخوان' });
        return;
      }
      // رویدادهای 'finish' پیام‌های پیشرفت میانی PosInterface هستند و نادیده گرفته می‌شوند —
      // اگر هیچ‌وقت transactionDone نرسد، تایم‌اوت بالا کنترل را به دست می‌گیرد.
    });

    child.on('error', (err: Error) => {
      finish({ success: false, error: `اجرای PosBridge ناموفق بود: ${err.message}` });
    });

    child.on('exit', (code) => {
      if (!settled) {
        finish({ success: false, error: `PosBridge بدون پاسخ بسته شد (کد ${code})` });
      }
    });
  });
}
