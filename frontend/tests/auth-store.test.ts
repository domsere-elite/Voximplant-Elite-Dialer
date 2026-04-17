import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/api', () => {
  const post = vi.fn();
  const get = vi.fn();
  const patch = vi.fn();
  const instance = {
    post,
    get,
    patch,
    interceptors: {
      request: { use: vi.fn() },
      response: { use: vi.fn() }
    }
  };
  return {
    api: instance,
    setAuthToken: vi.fn(),
    clearAuthToken: vi.fn()
  };
});

import { api } from '@/lib/api';
import { useAuthStore } from '@/stores/auth-store';

describe('auth-store', () => {
  beforeEach(() => {
    localStorage.clear();
    useAuthStore.setState({ user: null, token: null, voximplantUser: null, status: 'idle', error: null });
    vi.clearAllMocks();
  });

  it('login stores token, user, and voximplant credentials', async () => {
    (api.post as any).mockResolvedValueOnce({
      data: {
        token: 'jwt-123',
        user: { id: 'u1', email: 'a@b.com', role: 'rep', crmUserId: 'c1' },
        voximplantUser: {
          username: 'agent1@app.acc.voximplant.com',
          oneTimeKey: 'otk-abc',
          applicationName: 'app',
          accountName: 'acc'
        }
      }
    });

    await useAuthStore.getState().login('a@b.com', 'pw');

    const state = useAuthStore.getState();
    expect(state.token).toBe('jwt-123');
    expect(state.user?.email).toBe('a@b.com');
    expect(state.voximplantUser?.oneTimeKey).toBe('otk-abc');
    expect(localStorage.getItem('dialer.token')).toBe('jwt-123');
    expect(JSON.parse(localStorage.getItem('dialer.user')!).email).toBe('a@b.com');
    expect(JSON.parse(localStorage.getItem('dialer.voximplant')!).username)
      .toBe('agent1@app.acc.voximplant.com');
  });

  it('login records error on failure', async () => {
    (api.post as any).mockRejectedValueOnce({ response: { data: { message: 'Invalid' } } });

    await useAuthStore.getState().login('a@b.com', 'bad');

    const state = useAuthStore.getState();
    expect(state.token).toBeNull();
    expect(state.error).toMatch(/invalid/i);
    expect(state.status).toBe('error');
  });

  it('logout clears storage and state', () => {
    localStorage.setItem('dialer.token', 'jwt-123');
    localStorage.setItem('dialer.user', JSON.stringify({ id: 'u1', email: 'a', role: 'rep', crmUserId: 'c1' }));
    localStorage.setItem('dialer.voximplant', JSON.stringify({ username: 'u', oneTimeKey: 'k', applicationName: 'a', accountName: 'a' }));
    useAuthStore.setState({
      user: { id: 'u1', email: 'a', role: 'rep', crmUserId: 'c1' },
      token: 'jwt-123',
      voximplantUser: { username: 'u', oneTimeKey: 'k', applicationName: 'a', accountName: 'a' },
      status: 'authenticated',
      error: null
    });

    useAuthStore.getState().logout();

    expect(localStorage.getItem('dialer.token')).toBeNull();
    expect(localStorage.getItem('dialer.user')).toBeNull();
    expect(localStorage.getItem('dialer.voximplant')).toBeNull();
    expect(useAuthStore.getState().user).toBeNull();
    expect(useAuthStore.getState().token).toBeNull();
  });

  it('initFromStorage hydrates state from localStorage', () => {
    localStorage.setItem('dialer.token', 'jwt-999');
    localStorage.setItem('dialer.user', JSON.stringify({ id: 'u1', email: 'a@b.com', role: 'rep', crmUserId: 'c1' }));
    localStorage.setItem('dialer.voximplant', JSON.stringify({ username: 'u', oneTimeKey: 'k', applicationName: 'a', accountName: 'a' }));

    useAuthStore.getState().initFromStorage();

    const state = useAuthStore.getState();
    expect(state.token).toBe('jwt-999');
    expect(state.user?.email).toBe('a@b.com');
    expect(state.status).toBe('authenticated');
  });
});
