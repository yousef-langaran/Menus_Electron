/**
 * هنگام build الکترون، آدرس بروزرسانی را از .env روت پروژه می‌خواند و در dist می‌نویسد
 * تا در نسخهٔ نصب‌شده (بدون .env کنار exe) هم در دسترس باشد.
 */
const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');

const rootDir = path.join(__dirname, '..');
const envPath = path.join(rootDir, '.env');
const outPath = path.join(rootDir, 'dist', 'packaged-update-env.json');

let updateServerUrl = '';
if (fs.existsSync(envPath)) {
  const parsed = dotenv.parse(fs.readFileSync(envPath));
  updateServerUrl =
    parsed.UPDATE_SERVER_URL ||
    parsed.VITE_UPDATE_SERVER_URL ||
    parsed.NEXT_PUBLIC_UPDATE_SERVER_URL ||
    '';
  updateServerUrl = String(updateServerUrl).trim().replace(/\/+$/, '');
}

const outDir = path.dirname(outPath);
if (!fs.existsSync(outDir)) {
  fs.mkdirSync(outDir, { recursive: true });
}
fs.writeFileSync(outPath, JSON.stringify({ updateServerUrl }), 'utf8');
if (updateServerUrl) {
  console.log('[write-packaged-update-env] wrote', outPath);
} else {
  console.warn(
    '[write-packaged-update-env] updateServerUrl empty — set UPDATE_SERVER_URL (or VITE_ / NEXT_PUBLIC_) in .env before dist',
  );
}
