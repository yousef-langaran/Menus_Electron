import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { EventEmitter } from 'events';

/** Stand-in for Electron's ClientRequest: an emitter plus abort/end spies. */
class FakeRequest extends EventEmitter {
  abort = vi.fn();
  end = vi.fn();
}

let lastRequest: FakeRequest;
const netRequest = vi.fn((_options: unknown) => {
  lastRequest = new FakeRequest();
  return lastRequest;
});

vi.mock('electron', () => ({ net: { request: (o: unknown) => netRequest(o) } }));

const { isOnline } = await import('../network');

const ORIGINAL_ENV = { ...process.env };

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  delete process.env.NEXT_PUBLIC_API_BASE_URL;
  delete process.env.NEXT_PUBLIC_API_BASE_VERSION;
});

afterEach(() => {
  vi.useRealTimers();
  process.env = { ...ORIGINAL_ENV };
});

describe('isOnline', () => {
  it('targets the default production API when no env is set', async () => {
    const promise = isOnline();
    lastRequest.emit('response', {});
    await promise;

    expect(netRequest).toHaveBeenCalledWith({
      method: 'GET',
      url: 'https://api.secoin.ir/api/v1',
    });
  });

  it('honours the configured base url and version', async () => {
    process.env.NEXT_PUBLIC_API_BASE_URL = 'http://localhost:3001';
    process.env.NEXT_PUBLIC_API_BASE_VERSION = '/api/v2';

    const promise = isOnline();
    lastRequest.emit('response', {});
    await promise;

    expect(netRequest).toHaveBeenCalledWith({
      method: 'GET',
      url: 'http://localhost:3001/api/v2',
    });
  });

  it('reports online as soon as the server answers', async () => {
    const promise = isOnline();
    lastRequest.emit('response', { statusCode: 200 });

    await expect(promise).resolves.toBe(true);
  });

  // Any HTTP answer proves the box has a route to the API; the POS only needs
  // reachability, not a successful call.
  it.each([401, 404, 500])('treats an HTTP %i answer as online', async (statusCode) => {
    const promise = isOnline();
    lastRequest.emit('response', { statusCode });

    await expect(promise).resolves.toBe(true);
  });

  it('reports offline on a network error', async () => {
    const promise = isOnline();
    lastRequest.emit('error', new Error('ENOTFOUND'));

    await expect(promise).resolves.toBe(false);
  });

  it('gives up and reports offline after the 3s timeout', async () => {
    const promise = isOnline();

    await vi.advanceTimersByTimeAsync(3000);

    await expect(promise).resolves.toBe(false);
    expect(lastRequest.abort).toHaveBeenCalled();
  });

  it('does not abort the request once a response arrived in time', async () => {
    const promise = isOnline();
    lastRequest.emit('response', {});
    await promise;

    await vi.advanceTimersByTimeAsync(5000);

    expect(lastRequest.abort).not.toHaveBeenCalled();
  });

  it('sends the request', async () => {
    const promise = isOnline();
    lastRequest.emit('response', {});
    await promise;

    expect(lastRequest.end).toHaveBeenCalled();
  });
});
