import { app } from 'electron';
import * as fs from 'fs';
import * as path from 'path';

const ensureDir = async (dirPath: string) => {
  await fs.promises.mkdir(dirPath, { recursive: true });
};

const getStorePath = (fileName: string) => {
  const basePath = app.getPath('userData');
  return path.join(basePath, fileName);
};

export async function readJsonFile<T>(fileName: string, defaultValue: T): Promise<T> {
  try {
    const filePath = getStorePath(fileName);
    const data = await fs.promises.readFile(filePath, 'utf8');
    return JSON.parse(data);
  } catch (error: any) {
    if (error?.code === 'ENOENT') {
      return defaultValue;
    }
    console.error(`Failed to read ${fileName}:`, error);
    return defaultValue;
  }
}

export async function writeJsonFile<T>(fileName: string, data: T): Promise<void> {
  try {
    const filePath = getStorePath(fileName);
    await ensureDir(path.dirname(filePath));
    await fs.promises.writeFile(filePath, JSON.stringify(data, null, 2), 'utf8');
  } catch (error) {
    console.error(`Failed to write ${fileName}:`, error);
  }
}

export async function deleteJsonFile(fileName: string): Promise<void> {
  try {
    const filePath = getStorePath(fileName);
    await fs.promises.unlink(filePath);
  } catch (error: any) {
    if (error?.code !== 'ENOENT') {
      console.error(`Failed to delete ${fileName}:`, error);
    }
  }
}

