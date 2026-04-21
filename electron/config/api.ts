import { app } from 'electron';
import * as path from 'path';
import * as fs from 'fs';

interface ApiConfig {
  baseURL: string;
  token?: string;
  restaurantName?: string;
  restaurantId?: number;
  /** آدرس پایهٔ generic برای electron-updater (اختیاری؛ اگر در .env نبود از اینجا) */
  updateServerUrl?: string;
}

let cachedFileConfig: Partial<ApiConfig> | null = null;

/** از خروجی build (packaged-update-env.json) — وقتی .env داخل نصب نیست */
let packagedUpdateEnvRead = false;
let cachedPackagedUpdateUrl = '';

/** baseURL فقط از env؛ هیچ مقدار دستی/کش‌شده برای آدرس API استفاده نمی‌شود */
function getBaseUrlFromEnv(): string {
  const envUrl =
    process.env.API_BASE_URL ||
    process.env.NEXT_PUBLIC_API_BASE_URL ||
    process.env.VITE_API_BASE_URL ||
    '';
  const base = String(envUrl).trim().replace(/\/+$/, '');
  if (!base) return '';
  return base.includes('/api') ? base : `${base}/api/v1`;
}

export function getApiConfig(): ApiConfig {
  if (!cachedFileConfig) {
    const configPath = path.join(app.getPath('userData'), 'api-config.json');
    try {
      if (fs.existsSync(configPath)) {
        const configData = fs.readFileSync(configPath, 'utf-8');
        cachedFileConfig = JSON.parse(configData);
      }
    } catch (error) {
      console.error('Error reading API config:', error);
    }
  }

  const baseURL = getBaseUrlFromEnv() || (cachedFileConfig?.baseURL as string) || '';
  return {
    baseURL: baseURL || 'https://api.hoshmenu.ir/api/v1',
    ...(cachedFileConfig && {
      token: cachedFileConfig.token,
      restaurantName: cachedFileConfig.restaurantName,
      restaurantId: cachedFileConfig.restaurantId,
      updateServerUrl: cachedFileConfig.updateServerUrl,
    }),
  };
}

function readPackagedUpdateEnvFromDist(): string {
  if (packagedUpdateEnvRead) {
    return cachedPackagedUpdateUrl;
  }
  packagedUpdateEnvRead = true;
  try {
    const p = path.join(__dirname, '..', 'packaged-update-env.json');
    if (!fs.existsSync(p)) {
      return '';
    }
    const j = JSON.parse(fs.readFileSync(p, 'utf8')) as { updateServerUrl?: string };
    const u = typeof j.updateServerUrl === 'string' ? j.updateServerUrl.trim() : '';
    cachedPackagedUpdateUrl = u.replace(/\/+$/, '');
  } catch {
    cachedPackagedUpdateUrl = '';
  }
  return cachedPackagedUpdateUrl;
}

/**
 * آدرس feed بروزرسانی برای main process:
 * ۱) متغیرهای محیطی (از .env کنار exe / userData / …)
 * ۲) api-config.json در userData (updateServerUrl)
 * ۳) فایل packaged-update-env.json که هنگام `npm run build:electron` از .env پروژه ساخته می‌شود
 */
export function getUpdateServerUrl(): string {
  getApiConfig();
  const fromEnv = (
    process.env.UPDATE_SERVER_URL ||
    process.env.VITE_UPDATE_SERVER_URL ||
    process.env.NEXT_PUBLIC_UPDATE_SERVER_URL ||
    ''
  ).trim();
  const fromUserDataFile =
    typeof cachedFileConfig?.updateServerUrl === 'string' ? cachedFileConfig.updateServerUrl.trim() : '';
  const fromBuild = readPackagedUpdateEnvFromDist();
  const raw = fromEnv || fromUserDataFile || fromBuild;
  return raw.replace(/\/+$/, '');
}

export function saveApiConfig(config: ApiConfig): void {
  cachedFileConfig = config;
  const configPath = path.join(app.getPath('userData'), 'api-config.json');
  try {
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf-8');
  } catch (error) {
    console.error('Error saving API config:', error);
  }
}

