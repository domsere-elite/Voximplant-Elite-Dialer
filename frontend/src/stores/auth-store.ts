import { create } from 'zustand';
import { api, setAuthToken, clearAuthToken } from '@/lib/api';
import type { User, VoximplantUser } from '@/types';

type AuthStatus = 'idle' | 'loading' | 'authenticated' | 'error';

interface AuthState {
  user: User | null;
  token: string | null;
  voximplantUser: VoximplantUser | null;
  status: AuthStatus;
  error: string | null;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
  initFromStorage: () => void;
}

const TOKEN_KEY = 'dialer.token';
const USER_KEY = 'dialer.user';
const VOX_KEY = 'dialer.voximplant';

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  token: null,
  voximplantUser: null,
  status: 'idle',
  error: null,

  async login(email, password) {
    set({ status: 'loading', error: null });
    try {
      const { data } = await api.post('/api/auth/login', { email, password });
      const { token, user, voximplantUser } = data as {
        token: string;
        user: User;
        voximplantUser: VoximplantUser;
      };

      if (typeof window !== 'undefined') {
        window.localStorage.setItem(TOKEN_KEY, token);
        window.localStorage.setItem(USER_KEY, JSON.stringify(user));
        window.localStorage.setItem(VOX_KEY, JSON.stringify(voximplantUser));
      }
      setAuthToken(token);
      set({ token, user, voximplantUser, status: 'authenticated', error: null });
    } catch (err: any) {
      const message =
        err?.response?.data?.message ||
        err?.response?.data?.error ||
        (err?.response?.status === 401 ? 'Invalid email or password' : 'Login failed');
      set({ status: 'error', error: message, token: null, user: null, voximplantUser: null });
    }
  },

  logout() {
    if (typeof window !== 'undefined') {
      window.localStorage.removeItem(TOKEN_KEY);
      window.localStorage.removeItem(USER_KEY);
      window.localStorage.removeItem(VOX_KEY);
    }
    clearAuthToken();
    set({ user: null, token: null, voximplantUser: null, status: 'idle', error: null });
  },

  initFromStorage() {
    if (typeof window === 'undefined') return;
    const token = window.localStorage.getItem(TOKEN_KEY);
    const rawUser = window.localStorage.getItem(USER_KEY);
    const rawVox = window.localStorage.getItem(VOX_KEY);
    if (!token || !rawUser) return;
    try {
      const user = JSON.parse(rawUser) as User;
      const voximplantUser = rawVox ? (JSON.parse(rawVox) as VoximplantUser) : null;
      setAuthToken(token);
      set({ token, user, voximplantUser, status: 'authenticated', error: null });
    } catch {
      window.localStorage.removeItem(TOKEN_KEY);
      window.localStorage.removeItem(USER_KEY);
      window.localStorage.removeItem(VOX_KEY);
    }
  }
}));
