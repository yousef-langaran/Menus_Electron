# راهنمای نصب و راه‌اندازی

## پیش‌نیازها

1. **Node.js**: نسخه 18 یا بالاتر
   - دانلود از: https://nodejs.org/

2. **npm** یا **yarn**: معمولاً همراه با Node.js نصب می‌شود

## مراحل نصب

### 1. نصب وابستگی‌ها

```bash
cd Menus_Electron
npm install
```

یا با yarn:

```bash
yarn install
```

### 2. اجرای برنامه در حالت توسعه

```bash
npm run dev
```

این دستور:
- سرور توسعه React را در پورت 3002 راه‌اندازی می‌کند
- Electron را اجرا می‌کند و به سرور توسعه متصل می‌شود

### 3. ساخت برنامه برای تولید

```bash
npm run build
```

این دستور:
- فایل‌های TypeScript را کامپایل می‌کند
- React app را build می‌کند

### 4. ساخت فایل اجرایی

```bash
npm run dist
```

این دستور:
- برنامه را build می‌کند
- فایل اجرایی را در پوشه `release` ایجاد می‌کند

## ساختار فایل‌های خروجی

پس از اجرای `npm run dist`:

- **Windows**: فایل `.exe` و `.nsis` installer در `release/` ایجاد می‌شود
- **macOS**: فایل `.dmg` در `release/` ایجاد می‌شود
- **Linux**: فایل `.AppImage` در `release/` ایجاد می‌شود

## تنظیمات

### تغییر آدرس API

فایل `src/services/api.ts` را ویرایش کنید:

```typescript
const API_BASE_URL = 'https://your-api-url.com/api/v1';
```

یا از متغیر محیطی استفاده کنید:

```bash
export API_BASE_URL=https://your-api-url.com/api/v1
npm run dev
```

## عیب‌یابی

### مشکل در نصب وابستگی‌ها

```bash
# پاک کردن node_modules و نصب مجدد
rm -rf node_modules package-lock.json
npm install
```

### مشکل در اجرای Electron

```bash
# کامپایل دستی فایل‌های TypeScript
npm run build:electron
npm run dev:electron
```

### مشکل در چاپ

- مطمئن شوید پرینترها به سیستم متصل هستند
- در Windows، ممکن است نیاز به تنظیمات اضافی باشد
- لاگ‌های خطا را در کنسول بررسی کنید

## پشتیبانی

برای مشکلات بیشتر، لطفاً issue ایجاد کنید.

