import { describe, it, expect, beforeEach, vi } from 'vitest';

const mkdir = vi.fn().mockResolvedValue(undefined);
const readFile = vi.fn();
const writeFile = vi.fn().mockResolvedValue(undefined);
const unlink = vi.fn().mockResolvedValue(undefined);

vi.mock('electron', () => ({
  app: { getPath: vi.fn(() => 'C:/userData') },
}));

vi.mock('fs', () => ({
  promises: { mkdir, readFile, writeFile, unlink },
}));

const { readJsonFile, writeJsonFile, deleteJsonFile } = await import('../jsonStore');

/** Node's ENOENT shape — the only error the store is allowed to swallow silently. */
const enoent = () => Object.assign(new Error('not found'), { code: 'ENOENT' });

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('readJsonFile', () => {
  it('parses the stored JSON', async () => {
    readFile.mockResolvedValue('{"orders":[1,2]}');

    await expect(readJsonFile('orders.json', {})).resolves.toEqual({ orders: [1, 2] });
  });

  it('reads from the app userData directory', async () => {
    readFile.mockResolvedValue('{}');

    await readJsonFile('orders.json', {});

    expect(readFile).toHaveBeenCalledWith(expect.stringContaining('orders.json'), 'utf8');
    expect(readFile.mock.calls[0][0]).toContain('userData');
  });

  it('returns the default on first run, before the file exists', async () => {
    readFile.mockRejectedValue(enoent());

    await expect(readJsonFile('orders.json', { orders: [] })).resolves.toEqual({ orders: [] });
    expect(console.error).not.toHaveBeenCalled();
  });

  it('returns the default — and logs — when the queue file is corrupted', async () => {
    readFile.mockResolvedValue('{ this is not json');

    await expect(readJsonFile('orders.json', { orders: [] })).resolves.toEqual({ orders: [] });
    expect(console.error).toHaveBeenCalled();
  });

  it('returns the default on an unexpected IO error rather than crashing the main process', async () => {
    readFile.mockRejectedValue(Object.assign(new Error('EACCES'), { code: 'EACCES' }));

    await expect(readJsonFile('orders.json', null)).resolves.toBeNull();
    expect(console.error).toHaveBeenCalled();
  });
});

describe('writeJsonFile', () => {
  it('creates the directory before writing', async () => {
    await writeJsonFile('orders.json', { orders: [] });

    expect(mkdir).toHaveBeenCalledWith(expect.stringContaining('userData'), {
      recursive: true,
    });
    expect(mkdir.mock.invocationCallOrder[0]).toBeLessThan(
      writeFile.mock.invocationCallOrder[0],
    );
  });

  it('writes pretty-printed JSON so the queue stays inspectable', async () => {
    await writeJsonFile('orders.json', { orders: [1] });

    expect(writeFile).toHaveBeenCalledWith(
      expect.stringContaining('orders.json'),
      JSON.stringify({ orders: [1] }, null, 2),
      'utf8',
    );
  });

  it('swallows a write failure instead of taking down the main process', async () => {
    writeFile.mockRejectedValueOnce(new Error('disk full'));

    await expect(writeJsonFile('orders.json', {})).resolves.toBeUndefined();
    expect(console.error).toHaveBeenCalled();
  });
});

describe('deleteJsonFile', () => {
  it('unlinks the file', async () => {
    await deleteJsonFile('orders.json');

    expect(unlink).toHaveBeenCalledWith(expect.stringContaining('orders.json'));
  });

  it('stays quiet when the file was already gone', async () => {
    unlink.mockRejectedValueOnce(enoent());

    await expect(deleteJsonFile('orders.json')).resolves.toBeUndefined();
    expect(console.error).not.toHaveBeenCalled();
  });

  it('logs any other delete failure but does not throw', async () => {
    unlink.mockRejectedValueOnce(Object.assign(new Error('EBUSY'), { code: 'EBUSY' }));

    await expect(deleteJsonFile('orders.json')).resolves.toBeUndefined();
    expect(console.error).toHaveBeenCalled();
  });
});
