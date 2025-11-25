import { create } from 'zustand';
import { cacheUser, getCachedUser, clearUserCache } from '../services/cache';
import { login as apiLogin } from '../services/api';

interface User {
  id: number;
  mobile: string;
  firstName?: string;
  lastName?: string;
  restaurants?: any[];
}

interface AuthState {
  user: User | null;
  token: string | null;
  isLoading: boolean;
  isHydrated: boolean;
  error: string | null;
  login: (mobile: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  loadCachedUser: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  token: null,
  isLoading: false,
  isHydrated: false,
  error: null,

  login: async (mobile: string, password: string) => {
    set({ isLoading: true, error: null });
    try {
      const response = await apiLogin(mobile, password);
      
      // Handle different response formats
      if (response.user && response.access_token) {
        await cacheUser(response.user, response.access_token);
        set({
          user: response.user,
          token: response.access_token,
          isLoading: false,
          isHydrated: true,
        });
      } else if (response.data && response.data.user && response.data.access_token) {
        // Handle wrapped response
        await cacheUser(response.data.user, response.data.access_token);
        set({
          user: response.data.user,
          token: response.data.access_token,
          isLoading: false,
          isHydrated: true,
        });
      } else {
        throw new Error('پاسخ نامعتبر از سرور');
      }
    } catch (error: any) {
      let errorMessage = 'خطا در ورود به سیستم';
      
      if (error.response) {
        // Server responded with error
        errorMessage = error.response.data?.message || 
                      error.response.data?.error || 
                      `خطا: ${error.response.status} ${error.response.statusText}`;
      } else if (error.request) {
        // Request was made but no response received
        errorMessage = 'خطا در اتصال به سرور. لطفاً اتصال اینترنت خود را بررسی کنید.';
      } else {
        // Something else happened
        errorMessage = error.message || 'خطا در ورود به سیستم';
      }
      
      console.error('Login error:', error);
      set({
        error: errorMessage,
        isLoading: false,
        isHydrated: true,
      });
      throw new Error(errorMessage);
    }
  },

  logout: async () => {
    await clearUserCache();
    set({ user: null, token: null, isHydrated: true });
  },

  loadCachedUser: async () => {
    const cached = await getCachedUser();
    if (cached && cached.user && cached.token) {
      set({ user: cached.user, token: cached.token, isHydrated: true });
      return;
    }
    set({ isHydrated: true });
  },
}));

