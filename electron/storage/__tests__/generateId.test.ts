import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// `generateId` keeps module-level state (the last-issued id), so it must be
// re-imported fresh for every test to avoid state leaking across tests.
async function freshGenerateId() {
  vi.resetModules();
  const mod = await import('../generateId');
  return mod.generateId;
}

beforeEach(() => {
  vi.restoreAllMocks();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('generateId', () => {
  it('returns a number', async () => {
    const generateId = await freshGenerateId();
    expect(typeof generateId()).toBe('number');
  });

  it('returns strictly increasing ids across sequential calls', async () => {
    const generateId = await freshGenerateId();
    const a = generateId();
    const b = generateId();
    const c = generateId();
    expect(b).toBeGreaterThan(a);
    expect(c).toBeGreaterThan(b);
  });

  it('never collides for calls that land in the same millisecond', async () => {
    const generateId = await freshGenerateId();
    vi.spyOn(Date, 'now').mockReturnValue(1_700_000_000_000);

    const ids = Array.from({ length: 50 }, () => generateId());

    expect(new Set(ids).size).toBe(ids.length);
    // Still increasing despite Date.now() never advancing.
    for (let i = 1; i < ids.length; i++) {
      expect(ids[i]).toBeGreaterThan(ids[i - 1]);
    }
  });

  it('stays monotonic even if the system clock jumps backward', async () => {
    const generateId = await freshGenerateId();
    vi.spyOn(Date, 'now').mockReturnValueOnce(1_700_000_000_000);
    const first = generateId();

    vi.spyOn(Date, 'now').mockReturnValueOnce(1_600_000_000_000); // clock went backward
    const second = generateId();

    expect(second).toBeGreaterThan(first);
  });

  it('stays within Number.MAX_SAFE_INTEGER for realistic volumes', async () => {
    const generateId = await freshGenerateId();
    vi.spyOn(Date, 'now').mockReturnValue(1_700_000_000_000);

    let last = 0;
    for (let i = 0; i < 10_000; i++) {
      last = generateId();
    }

    expect(Number.isSafeInteger(last)).toBe(true);
  });
});
