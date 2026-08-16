# PosBridge (کارتخوان آسان پرداخت/PosInterface)

میان‌واسط کنسول C# که `PosInterface.dll` شرکت آسان‌پرداخت کیش را wrap می‌کند و از طریق
خطوط JSON روی stdin/stdout با پروسه‌ی main الکترون (`electron/services/asanPardakht.ts`)
صحبت می‌کند. چون `PosInterface.dll` یک اسمبلی معمولی .NET است (نه COM)، همین رفرنس‌گیری
مستقیم کافی است — نیازی به `regasm`/ثبت COM یا کتابخانه‌ای مثل winax نیست.

پروتکل: هر خط ورودی/خروجی یک JSON object است.

ورودی‌ها (`cmd`):
- `{"cmd":"init","mode":"lan","ip":"...","port":17000}` یا `{"cmd":"init","mode":"serial","comPort":"COM3","baudRate":9600}`
- `{"cmd":"payment","amount":"...","tashim":"1","invoiceNumber":"..."}`
- `{"cmd":"billPayment","paymentIds":"...","billIds":"..."}`
- `{"cmd":"inquiry"}`
- `{"cmd":"stop"}` — لغو عملیات جاری (`PCPos.Stop()`)
- `{"cmd":"exit"}`

خروجی‌ها (`type`): `ready`, `initDone`, `transactionDone` (شامل `result`), `finish`, `stopped`, `error`.

## بازساخت (rebuild)

باینری کامپایل‌شده در `assets/pos-bridge/` کنار `PosInterface.dll` (که از SDK شرکت
آسان‌پرداخت گرفته شده) commit شده. برای rebuild بعد از تغییر `Program.cs`، از همان
کامپایلر C# داخل ویندوز استفاده کنید (نیازی به نصب .NET SDK نیست):

```powershell
$csc = "C:\Windows\Microsoft.NET\Framework64\v4.0.30319\csc.exe"
& $csc /nologo /target:exe /platform:anycpu `
  /out:"..\..\..\assets\pos-bridge\PosBridge.exe" `
  /reference:"..\..\..\assets\pos-bridge\PosInterface.dll" `
  Program.cs
```

`PosBridge.exe.config` (target .NET Framework v4.0) را هم کنار exe نگه دارید — تغییری
لازم ندارد مگر نسخه فریم‌ورک هدف عوض شود.
