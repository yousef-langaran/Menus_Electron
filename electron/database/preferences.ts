import { app } from 'electron';
import * as path from 'path';
import * as fs from 'fs';

interface PreferencesFile {
  userSession?: {
    user: any;
    token: string;
    cachedAt: string;
  };
  printerConfigs?: Record<string, any>;
}

const FILE_NAME = 'menus-preferences.json';

const getPreferencesPath = () => {
  try {
    return path.join(app.getPath('userData'), FILE_NAME);
  } catch {
    return path.join(process.cwd(), FILE_NAME);
  }
};

const readPreferences = async (): Promise<PreferencesFile> => {
  const filePath = getPreferencesPath();
  try {
    const raw = await fs.promises.readFile(filePath, 'utf-8');
    const data = JSON.parse(raw);
    return typeof data === 'object' && data ? data : {};
  } catch (error: any) {
    if (error?.code === 'ENOENT') {
      return {};
    }
    console.error('Failed to read preferences:', error);
    return {};
  }
};

const writePreferences = async (prefs: PreferencesFile) => {
  const filePath = getPreferencesPath();
  const dir = path.dirname(filePath);
  await fs.promises.mkdir(dir, { recursive: true });
  await fs.promises.writeFile(filePath, JSON.stringify(prefs, null, 2), 'utf-8');
};

export async function loadUserSession() {
  const prefs = await readPreferences();
  return prefs.userSession || null;
}

export async function saveUserSession(user: any, token: string) {
  const prefs = await readPreferences();
  prefs.userSession = { user, token, cachedAt: new Date().toISOString() };
  await writePreferences(prefs);
}

export async function clearUserSession() {
  const prefs = await readPreferences();
  if (prefs.userSession) {
    delete prefs.userSession;
    await writePreferences(prefs);
  }
}

export async function loadPrinterConfigs() {
  const prefs = await readPreferences();
  return prefs.printerConfigs || {};
}

export async function savePrinterConfigs(configs: Record<string, any>) {
  const prefs = await readPreferences();
  prefs.printerConfigs = configs || {};
  await writePreferences(prefs);
}

