import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const handlers: Record<string, Function[]> = {};

const fakeSocket = {
  on: vi.fn((evt: string, cb: Function) => {
    handlers[evt] = handlers[evt] || [];
    handlers[evt].push(cb);
    return () => {
      handlers[evt] = (handlers[evt] || []).filter((h) => h !== cb);
    };
  })
};

vi.mock('@/hooks/useSocket', () => ({
  useSocket: () => ({
    socket: fakeSocket,
    connected: true,
    on: (event: string, cb: Function) => fakeSocket.on(event, cb),
    joinCampaign: vi.fn()
  })
}));

import { useRealtimeCall } from '@/hooks/useRealtimeCall';

beforeEach(() => {
  for (const key of Object.keys(handlers)) delete handlers[key];
  vi.clearAllMocks();
});

function fire(event: string, payload: any) {
  (handlers[event] || []).forEach((h) => h(payload));
}

describe('useRealtimeCall', () => {
  it('captures incoming/connected/ended events', () => {
    const { result } = renderHook(() => useRealtimeCall());

    act(() => fire('call:incoming', { voximplant_call_id: 'v1', from_number: '+15551234567' }));
    expect(result.current.incomingCall?.from_number).toBe('+15551234567');

    act(() => fire('call:connected', { voximplant_call_id: 'v1', started_at: '2026-04-16T00:00:00Z' }));
    expect(result.current.activeCall?.voximplant_call_id).toBe('v1');

    act(() => fire('call:ended', { voximplant_call_id: 'v1', call_id: 'c1', duration_seconds: 42 }));
    expect(result.current.lastOutcome?.call_id).toBe('c1');
    expect(result.current.activeCall).toBeNull();
  });

  it('captures preview:next events', () => {
    const { result } = renderHook(() => useRealtimeCall());

    act(() => fire('preview:next', { crm_account_id: 'acc1', phone: '+15551112222' }));
    expect(result.current.previewContact?.crm_account_id).toBe('acc1');
  });
});
