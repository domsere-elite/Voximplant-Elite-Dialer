import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const sockets: any[] = [];

vi.mock('socket.io-client', () => {
  const ioFn = vi.fn((url: string, opts: any) => {
    const handlers: Record<string, Function[]> = {};
    const socket = {
      url,
      opts,
      connected: true,
      on: vi.fn((evt: string, cb: Function) => {
        handlers[evt] = handlers[evt] || [];
        handlers[evt].push(cb);
      }),
      off: vi.fn((evt: string, cb: Function) => {
        handlers[evt] = (handlers[evt] || []).filter((h) => h !== cb);
      }),
      emit: vi.fn(),
      disconnect: vi.fn(),
      _handlers: handlers,
      _trigger: (evt: string, payload: any) => (handlers[evt] || []).forEach((h) => h(payload))
    };
    sockets.push(socket);
    return socket;
  });
  return { io: ioFn };
});

vi.mock('@/stores/auth-store', () => ({
  useAuthStore: Object.assign(
    (selector: any) => selector({ token: 'jwt-token' }),
    { getState: () => ({ token: 'jwt-token' }) }
  )
}));

import { useSocket } from '@/hooks/useSocket';

beforeEach(() => {
  sockets.length = 0;
  vi.clearAllMocks();
});

describe('useSocket', () => {
  it('connects with JWT on mount and disconnects on unmount', async () => {
    const { unmount } = renderHook(() => useSocket());
    expect(sockets.length).toBe(1);
    expect(sockets[0].opts.auth.token).toBe('jwt-token');
    unmount();
    expect(sockets[0].disconnect).toHaveBeenCalled();
  });

  it('on() wrapper auto-cleans handlers', async () => {
    const handler = vi.fn();
    const { result, unmount } = renderHook(() => useSocket());
    const teardown = result.current.on('call:incoming', handler);
    expect(sockets[0].on).toHaveBeenCalledWith('call:incoming', handler);
    teardown();
    expect(sockets[0].off).toHaveBeenCalledWith('call:incoming', handler);
    unmount();
  });

  it('joinCampaign emits join:campaign', () => {
    const { result } = renderHook(() => useSocket());
    result.current.joinCampaign('camp-1');
    expect(sockets[0].emit).toHaveBeenCalledWith('join:campaign', { campaignId: 'camp-1' });
  });
});
