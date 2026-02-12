import { app } from 'electron';
import * as path from 'path';
import * as fs from 'fs';

interface ApiConfig {
  baseURL: string;
  token?: string;
  restaurantName?: string;
  restaurantId?: number;
}

let cachedConfig: ApiConfig | null = null;

export function getApiConfig(): ApiConfig {
  if (cachedConfig) {
    return cachedConfig;
  }

  const configPath = path.join(app.getPath('userData'), 'api-config.json');
  
  try {
    if (fs.existsSync(configPath)) {
      const configData = fs.readFileSync(configPath, 'utf-8');
      cachedConfig = JSON.parse(configData);
    }
  } catch (error) {
    console.error('Error reading API config:', error);
  }

  if (!cachedConfig) {
    const envUrl = process.env.API_BASE_URL || process.env.NEXT_PUBLIC_API_BASE_URL || process.env.VITE_API_BASE_URL || '';
    const base = envUrl.replace(/\/+$/, '');
    cachedConfig = {
      baseURL: base
        ? (base.includes('/api') ? base : `${base}/api/v1`)
        : 'http://localhost:3001/api/v1',
    };
  }

  return cachedConfig;
}

export function saveApiConfig(config: ApiConfig): void {
  cachedConfig = config;
  const configPath = path.join(app.getPath('userData'), 'api-config.json');
  
  try {
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf-8');
  } catch (error) {
    console.error('Error saving API config:', error);
  }
}

