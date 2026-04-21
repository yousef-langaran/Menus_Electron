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

/**
 * آدرس feed بروزرسانی برای main process: از .env (UPDATE_SERVER_URL یا VITE_UPDATE_SERVER_URL)
 * و در غیر این صورت از api-config.json (کلید updateServerUrl).
 * مقدار بدون اسلش انتهایی برمی‌گردد.
 */
export function getUpdateServerUrl(): string {
  getApiConfig();
  const fromEnv = (
    process.env.UPDATE_SERVER_URL ||
    process.env.VITE_UPDATE_SERVER_URL ||
    ''
  ).trim();
  const fromFile =
    typeof cachedFileConfig?.updateServerUrl === 'string' ? cachedFileConfig.updateServerUrl.trim() : '';
  const raw = fromEnv || fromFile;
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

