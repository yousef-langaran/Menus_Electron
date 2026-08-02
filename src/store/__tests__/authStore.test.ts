import { describe, it, expect, beforeEach, vi } from 'vitest';

const cacheUser = vi.fn().mockResolvedValue(undefined);
const getCachedUser = vi.fn().mockResolvedValue(null);
const clearUserCache = vi.fn().mockResolvedValue(undefined);

const apiLogin = vi.fn();
const fetchProfile = vi.fn();
const getActiveSubscription = vi.fn();
const setLiveToken = vi.fn();

vi.mock('../../services/cache', () => ({
  cacheUser: (...a: unknown[]) => cacheUser(...a),
  getCachedUser: (...a: unknown[]) => getCachedUser(...a),
  clearUserCache: (...a: unknown[]) => clearUserCache(...a),
}));

vi.mock('../../services/api', () => ({
  login: (...a: unknown[]) => apiLogin(...a),
  fetchProfile: (...a: unknown[]) => fetchProfile(...a),
  getActiveSubscription: (...a: unknown[]) => getActiveSubscription(...a),
  setLiveToken: (...a: unknown[]) => setLiveToken(...a),
}));

const { useAuthStore } = await import('../authStore');

const RESTAURANT_ID = 10;

/** A user who owns a restaurant and may create orders — the happy path. */
const validUser = (overrides: Record<string, unknown> = {}) => ({
  id: 1,
  mobile: '09121234567',
  restaurants: [{ id: RESTAURANT_ID, name: 'bastanisara' }],
  restaurantPermissions: [
    {
      id: 1,
      module: 'orders_management',
      actions: ['create'],
      isActive: true,
      restaurant: { id: RESTAURANT_ID, name: 'bastanisara', name_fa: 'بستنی سرا' },
    },
  ],
  ...overrides,
});

const activeSubscription = () => ({
  id: 1,
  status: 'active',
  startsAt: '2026-01-01T00:00:00.000Z',
  expiresAt: '2027-01-01T00:00:00.000Z',
});

const resetStore = () =>
  useAuthStore.setState({
    user: null,
    token: null,
    isLoading: false,
    isHydrated: false,
    error: null,
    subscriptionExpiresAt: null,
  });

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers().setSystemTime(new Date('2026-08-01T00:00:00.000Z'));
  localStorage.clear();
  resetStore();
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});

  getCachedUser.mockResolvedValue(null);
  apiLogin.mockResolvedValue({ user: validUser(), access_token: 'tok-1' });
  getActiveSubscription.mockResolvedValue(activeSubscription());
});

describe('login', () => {
  it('drops any stale session before issuing a fresh login', async () => {
    await useAuthStore.getState().login('09121234567', 'pw');

    expect(clearUserCache).toHaveBeenCalled();
    expect(clearUserCache.mock.invocationCallOrder[0]).toBeLessThan(
      apiLogin.mock.invocationCallOrder[0],
    );
  });

  it('stores the user and token on success', async () => {
    await useAuthStore.getState().login('09121234567', 'pw');

    const state = useAuthStore.getState();
    expect(state.token).toBe('tok-1');
    expect(state.user?.id).toBe(1);
    expect(state.isHydrated).toBe(true);
    expect(state.isLoading).toBe(false);
    expect(state.error).toBeNull();
  });

  it('accepts the nested { data: { user, access_token } } response shape', async () => {
    apiLogin.mockResolvedValue({ data: { user: validUser(), access_token: 'tok-2' } });

    await useAuthStore.getState().login('09121234567', 'pw');

    expect(useAuthStore.getState().token).toBe('tok-2');
  });

  it('rejects an unrecognised response shape', async () => {
    apiLogin.mockResolvedValue({ something: 'else' });

    await expect(useAuthStore.getState().login('09121234567', 'pw')).rejects.toThrow(
      'پاسخ نامعتبر از سرور',
    );
    expect(useAuthStore.getState().token).toBeNull();
  });

  it('hands the token to the api module and the main process', async () => {
    await useAuthStore.getState().login('09121234567', 'pw');

    expect(setLiveToken).toHaveBeenCalledWith('tok-1');
  });

  it('persists the session to the offline cache', async () => {
    await useAuthStore.getState().login('09121234567', 'pw');

    expect(cacheUser).toHaveBeenCalledWith(expect.objectContaining({ id: 1 }), 'tok-1');
  });

  it('fetches the full profile when the login payload carries no restaurants', async () => {
    apiLogin.mockResolvedValue({ user: { id: 1, mobile: '09121234567' }, access_token: 'tok-1' });
    fetchProfile.mockResolvedValue(validUser());

    await useAuthStore.getState().login('09121234567', 'pw');

    expect(fetchProfile).toHaveBeenCalledWith('tok-1');
    expect(useAuthStore.getState().user?.restaurants).toHaveLength(1);
  });

  it('skips the profile fetch when restaurants already came back with the login', async () => {
    await useAuthStore.getState().login('09121234567', 'pw');

    expect(fetchProfile).not.toHaveBeenCalled();
  });

  describe('order permission gate', () => {
    it('rejects a user with no restaurant', async () => {
      apiLogin.mockResolvedValue({ user: { id: 1, mobile: 'x' }, access_token: 'tok-1' });
      fetchProfile.mockResolvedValue({ id: 1, mobile: 'x' });

      await expect(useAuthStore.getState().login('x', 'pw')).rejects.toThrow(
        /دسترسی ثبت سفارش/,
      );
    });

    it('rejects a user whose orders permission is inactive', async () => {
      apiLogin.mockResolvedValue({
        user: validUser({
          restaurantPermissions: [
            {
              id: 1,
              module: 'orders_management',
              actions: ['create'],
              isActive: false,
              restaurant: { id: RESTAURANT_ID, name: 'b', name_fa: 'ب' },
            },
          ],
        }),
        access_token: 'tok-1',
      });

      await expect(useAuthStore.getState().login('x', 'pw')).rejects.toThrow(
        /دسترسی ثبت سفارش/,
      );
    });

    it('rejects a permission granted on a different restaurant', async () => {
      apiLogin.mockResolvedValue({
        user: validUser({
          restaurantPermissions: [
            {
              id: 1,
              module: 'orders_management',
              actions: ['create'],
              isActive: true,
              restaurant: { id: 999, name: 'other', name_fa: 'دیگر' },
            },
          ],
        }),
        access_token: 'tok-1',
      });

      await expect(useAuthStore.getState().login('x', 'pw')).rejects.toThrow(
        /دسترسی ثبت سفارش/,
      );
    });

    it('rejects a permission on another module', async () => {
      apiLogin.mockResolvedValue({
        user: validUser({
          restaurantPermissions: [
            {
              id: 1,
              module: 'products_management',
              actions: ['create'],
              isActive: true,
              restaurant: { id: RESTAURANT_ID, name: 'b', name_fa: 'ب' },
            },
          ],
        }),
        access_token: 'tok-1',
      });

      await expect(useAuthStore.getState().login('x', 'pw')).rejects.toThrow(
        /دسترسی ثبت سفارش/,
      );
    });

    it('accepts the broader "manage" action in place of "create"', async () => {
      apiLogin.mockResolvedValue({
        user: validUser({
          restaurantPermissions: [
            {
              id: 1,
              module: 'orders_management',
              actions: ['manage'],
              isActive: true,
              restaurant: { id: RESTAURANT_ID, name: 'b', name_fa: 'ب' },
            },
          ],
        }),
        access_token: 'tok-1',
      });

      await expect(useAuthStore.getState().login('x', 'pw')).resolves.toBeUndefined();
    });
  });

  describe('subscription gate', () => {
    it('rejects when the restaurant has no active subscription', async () => {
      getActiveSubscription.mockResolvedValue(null);

      await expect(useAuthStore.getState().login('x', 'pw')).rejects.toThrow(
        /اشتراک فعالی یافت نشد/,
      );
    });

    it('rejects an expired subscription', async () => {
      getActiveSubscription.mockResolvedValue({
        ...activeSubscription(),
        expiresAt: '2026-07-01T00:00:00.000Z',
      });

      await expect(useAuthStore.getState().login('x', 'pw')).rejects.toThrow(/منقضی/);
    });

    it('rejects a non-active subscription status', async () => {
      getActiveSubscription.mockResolvedValue({
        ...activeSubscription(),
        status: 'suspended',
      });

      await expect(useAuthStore.getState().login('x', 'pw')).rejects.toThrow(/منقضی/);
    });

    it('caches the check so the POS can start offline later', async () => {
      await useAuthStore.getState().login('x', 'pw');

      expect(localStorage.getItem(`subscription_check_${RESTAURANT_ID}`)).toBe(
        '2026-08-01T00:00:00.000Z',
      );
      expect(
        JSON.parse(localStorage.getItem(`subscription_data_${RESTAURANT_ID}`)!),
      ).toEqual({ expiresAt: '2027-01-01T00:00:00.000Z', status: 'active' });
    });

    it('exposes the expiry date so the UI can warn before it lapses', async () => {
      await useAuthStore.getState().login('x', 'pw');

      expect(useAuthStore.getState().subscriptionExpiresAt).toBe('2027-01-01T00:00:00.000Z');
    });

    it('treats a 401 as an invalidated session and wipes the local grace cache', async () => {
      localStorage.setItem(`subscription_check_${RESTAURANT_ID}`, '2026-08-01T00:00:00.000Z');
      localStorage.setItem(
        `subscription_data_${RESTAURANT_ID}`,
        JSON.stringify({ expiresAt: '2027-01-01T00:00:00.000Z', status: 'active' }),
      );
      getActiveSubscription.mockRejectedValue({ response: { status: 401 } });

      await expect(useAuthStore.getState().login('x', 'pw')).rejects.toThrow(/باطل شده/);
      expect(localStorage.getItem(`subscription_check_${RESTAURANT_ID}`)).toBeNull();
      expect(localStorage.getItem(`subscription_data_${RESTAURANT_ID}`)).toBeNull();
    });

    it('falls back to the cached check while the network is down', async () => {
      localStorage.setItem(`subscription_check_${RESTAURANT_ID}`, '2026-07-31T20:00:00.000Z');
      localStorage.setItem(
        `subscription_data_${RESTAURANT_ID}`,
        JSON.stringify({ expiresAt: '2027-01-01T00:00:00.000Z', status: 'active' }),
      );
      getActiveSubscription.mockRejectedValue(new Error('network down'));

      await expect(useAuthStore.getState().login('x', 'pw')).resolves.toBeUndefined();
    });

    it('stops trusting the cached check after 24 hours offline', async () => {
      localStorage.setItem(`subscription_check_${RESTAURANT_ID}`, '2026-07-30T00:00:00.000Z');
      localStorage.setItem(
        `subscription_data_${RESTAURANT_ID}`,
        JSON.stringify({ expiresAt: '2027-01-01T00:00:00.000Z', status: 'active' }),
      );
      getActiveSubscription.mockRejectedValue(new Error('network down'));

      await expect(useAuthStore.getState().login('x', 'pw')).rejects.toThrow(
        /اتصال اینترنت لازم است/,
      );
    });

    it('rejects an offline start when the cached subscription itself has expired', async () => {
      localStorage.setItem(`subscription_check_${RESTAURANT_ID}`, '2026-07-31T20:00:00.000Z');
      localStorage.setItem(
        `subscription_data_${RESTAURANT_ID}`,
        JSON.stringify({ expiresAt: '2026-07-01T00:00:00.000Z', status: 'active' }),
      );
      getActiveSubscription.mockRejectedValue(new Error('network down'));

      await expect(useAuthStore.getState().login('x', 'pw')).rejects.toThrow(/منقضی/);
    });

    it('rejects an offline start with no cached check at all', async () => {
      getActiveSubscription.mockRejectedValue(new Error('network down'));

      await expect(useAuthStore.getState().login('x', 'pw')).rejects.toThrow(
        /اتصال اینترنت لازم است/,
      );
    });

    it('discards a corrupted grace cache instead of trusting it', async () => {
      localStorage.setItem(`subscription_check_${RESTAURANT_ID}`, '2026-07-31T20:00:00.000Z');
      localStorage.setItem(`subscription_data_${RESTAURANT_ID}`, '{not json');
      getActiveSubscription.mockRejectedValue(new Error('network down'));

      await expect(useAuthStore.getState().login('x', 'pw')).rejects.toThrow(
        /اتصال اینترنت لازم است/,
      );
      expect(localStorage.getItem(`subscription_data_${RESTAURANT_ID}`)).toBeNull();
    });
  });

  describe('error reporting', () => {
    it('surfaces the server-supplied message', async () => {
      apiLogin.mockRejectedValue({
        response: { status: 401, statusText: 'Unauthorized', data: { message: 'رمز اشتباه است' } },
      });

      await expect(useAuthStore.getState().login('x', 'pw')).rejects.toThrow('رمز اشتباه است');
      expect(useAuthStore.getState().error).toBe('رمز اشتباه است');
    });

    it('falls back to status text when the server sends no message', async () => {
      apiLogin.mockRejectedValue({
        response: { status: 500, statusText: 'Server Error', data: {} },
      });

      await expect(useAuthStore.getState().login('x', 'pw')).rejects.toThrow(
        'خطا: 500 Server Error',
      );
    });

    it('reports a connectivity problem when the request never got a reply', async () => {
      apiLogin.mockRejectedValue({ request: {} });

      await expect(useAuthStore.getState().login('x', 'pw')).rejects.toThrow(
        /اتصال به سرور/,
      );
    });

    it('clears isLoading and marks the store hydrated after a failure', async () => {
      apiLogin.mockRejectedValue(new Error('boom'));

      await expect(useAuthStore.getState().login('x', 'pw')).rejects.toThrow('boom');
      expect(useAuthStore.getState().isLoading).toBe(false);
      expect(useAuthStore.getState().isHydrated).toBe(true);
    });
  });
});

describe('logout', () => {
  it('clears the cache, the live token and the store', async () => {
    await useAuthStore.getState().login('x', 'pw');

    await useAuthStore.getState().logout();

    expect(clearUserCache).toHaveBeenCalled();
    expect(setLiveToken).toHaveBeenLastCalledWith(null);
    expect(useAuthStore.getState().user).toBeNull();
    expect(useAuthStore.getState().token).toBeNull();
    expect(useAuthStore.getState().isHydrated).toBe(true);
  });
});

describe('loadCachedUser', () => {
  it('marks the store hydrated when there is nothing cached', async () => {
    await useAuthStore.getState().loadCachedUser();

    expect(useAuthStore.getState().isHydrated).toBe(true);
    expect(useAuthStore.getState().user).toBeNull();
    expect(setLiveToken).toHaveBeenCalledWith(null);
  });

  it('restores a cached session', async () => {
    getCachedUser.mockResolvedValue({ user: validUser(), token: 'cached-tok' });

    await useAuthStore.getState().loadCachedUser();

    expect(useAuthStore.getState().token).toBe('cached-tok');
    expect(setLiveToken).toHaveBeenCalledWith('cached-tok');
  });

  it('does not overwrite a session that a fresh login already established', async () => {
    await useAuthStore.getState().login('x', 'pw');
    getCachedUser.mockResolvedValue({ user: validUser(), token: 'stale-tok' });

    await useAuthStore.getState().loadCachedUser();

    expect(useAuthStore.getState().token).toBe('tok-1');
    expect(getCachedUser).not.toHaveBeenCalled();
  });

  it('refreshes an incomplete cached profile and re-caches it', async () => {
    getCachedUser.mockResolvedValue({ user: { id: 1, mobile: 'x' }, token: 'cached-tok' });
    fetchProfile.mockResolvedValue(validUser());

    await useAuthStore.getState().loadCachedUser();

    expect(fetchProfile).toHaveBeenCalledWith('cached-tok');
    expect(cacheUser).toHaveBeenCalledWith(expect.objectContaining({ id: 1 }), 'cached-tok');
    expect(useAuthStore.getState().token).toBe('cached-tok');
  });

  it('keeps the cached user signed out when the profile fetch fails and leaves them incomplete', async () => {
    getCachedUser.mockResolvedValue({ user: { id: 1, mobile: 'x' }, token: 'cached-tok' });
    fetchProfile.mockRejectedValue(new Error('offline'));

    await useAuthStore.getState().loadCachedUser();

    expect(useAuthStore.getState().user).toBeNull();
    expect(useAuthStore.getState().isHydrated).toBe(true);
  });

  it('refuses a cached user who lost the order permission', async () => {
    getCachedUser.mockResolvedValue({
      user: validUser({ restaurantPermissions: [] }),
      token: 'cached-tok',
    });

    await useAuthStore.getState().loadCachedUser();

    expect(useAuthStore.getState().user).toBeNull();
    expect(useAuthStore.getState().isHydrated).toBe(true);
  });

  it('refuses a cached user whose subscription has lapsed', async () => {
    getCachedUser.mockResolvedValue({ user: validUser(), token: 'cached-tok' });
    getActiveSubscription.mockResolvedValue({
      ...activeSubscription(),
      expiresAt: '2026-07-01T00:00:00.000Z',
    });

    await useAuthStore.getState().loadCachedUser();

    expect(useAuthStore.getState().user).toBeNull();
  });
});
