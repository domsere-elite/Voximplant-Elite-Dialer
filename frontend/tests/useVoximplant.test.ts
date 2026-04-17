import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

type Handler = (event: any) => void;

class FakeCall {
  id: string;
  handlers: Record<string, Handler[]> = {};
  customData: string | undefined;
  constructor(id: string, customData?: string) {
    this.id = id;
    this.customData = customData;
  }
  on(event: string, cb: Handler) {
    this.handlers[event] = this.handlers[event] || [];
    this.handlers[event].push(cb);
  }
  off(event: string, cb: Handler) {
    this.handlers[event] = (this.handlers[event] || []).filter((h) => h !== cb);
  }
  trigger(event: string, payload: any = {}) {
    (this.handlers[event] || []).forEach((h) => h(payload));
  }
  answer = vi.fn();
  hangup = vi.fn();
  sendDigits = vi.fn();
  sendTone = vi.fn();
  muteMicrophone = vi.fn();
  unmuteMicrophone = vi.fn();
  hold = vi.fn();
  getCustomData() {
    return this.customData;
  }
}

const listeners: Record<string, Handler[]> = {};
const lastCall = { current: null as FakeCall | null };

const fakeClient = {
  init: vi.fn().mockResolvedValue(undefined),
  connect: vi.fn().mockResolvedValue(undefined),
  disconnect: vi.fn().mockResolvedValue(undefined),
  loginWithOneTimeKey: vi.fn().mockResolvedValue(undefined),
  setOperatorACDStatus: vi.fn().mockResolvedValue(undefined),
  call: vi.fn((opts: any) => {
    const call = new FakeCall('out-1', JSON.stringify({ autoAnswer: false }));
    lastCall.current = call;
    return call;
  }),
  on: vi.fn((event: string, cb: Handler) => {
    listeners[event] = listeners[event] || [];
    listeners[event].push(cb);
  }),
  off: vi.fn((event: string, cb: Handler) => {
    listeners[event] = (listeners[event] || []).filter((h) => h !== cb);
  })
};

function fire(event: string, payload: any) {
  (listeners[event] || []).forEach((h) => h(payload));
}

vi.mock('voximplant-websdk', () => ({
  default: {
    getInstance: () => fakeClient,
    Events: {
      ConnectionEstablished: 'ConnectionEstablished',
      ConnectionFailed: 'ConnectionFailed',
      ConnectionClosed: 'ConnectionClosed',
      AuthResult: 'AuthResult',
      IncomingCall: 'IncomingCall'
    },
    CallEvents: {
      Connected: 'Connected',
      Disconnected: 'Disconnected',
      Failed: 'Failed'
    },
    OperatorACDStatuses: {
      Ready: 'Ready',
      AfterService: 'AfterService',
      DND: 'DND',
      Offline: 'Offline'
    }
  }
}));

vi.mock('@/stores/auth-store', () => ({
  useAuthStore: Object.assign(
    (selector: any) =>
      selector({
        voximplantUser: {
          username: 'agent1@app.acc.voximplant.com',
          oneTimeKey: 'otk-abc',
          applicationName: 'app',
          accountName: 'acc'
        },
        token: 'jwt'
      }),
    {
      getState: () => ({
        voximplantUser: {
          username: 'agent1@app.acc.voximplant.com',
          oneTimeKey: 'otk-abc',
          applicationName: 'app',
          accountName: 'acc'
        }
      })
    }
  )
}));

import { useVoximplant } from '@/hooks/useVoximplant';

beforeEach(() => {
  for (const key of Object.keys(listeners)) delete listeners[key];
  lastCall.current = null;
  vi.clearAllMocks();
});

describe('useVoximplant', () => {
  it('connects and logs in using one-time key on mount', async () => {
    renderHook(() => useVoximplant());
    await waitFor(() => expect(fakeClient.init).toHaveBeenCalled());
    await waitFor(() => expect(fakeClient.connect).toHaveBeenCalled());
    act(() => fire('ConnectionEstablished', {}));
    await waitFor(() => expect(fakeClient.loginWithOneTimeKey).toHaveBeenCalled());
  });

  it('transitions to ringing on IncomingCall and active on Connected', async () => {
    const { result } = renderHook(() => useVoximplant());
    await waitFor(() => expect(fakeClient.init).toHaveBeenCalled());

    const call = new FakeCall('in-1', JSON.stringify({ autoAnswer: false }));
    act(() => fire('IncomingCall', { call }));
    expect(result.current.callState).toBe('ringing');
    expect(result.current.currentCall).toBe(call);

    act(() => call.trigger('Connected', {}));
    expect(result.current.callState).toBe('active');
  });

  it('auto-answers when incoming call customData requests it', async () => {
    renderHook(() => useVoximplant());
    await waitFor(() => expect(fakeClient.init).toHaveBeenCalled());

    const call = new FakeCall('in-2', JSON.stringify({ autoAnswer: true }));
    act(() => fire('IncomingCall', { call }));
    expect(call.answer).toHaveBeenCalled();
  });

  it('callPSTN invokes client.call and sets ringing state', async () => {
    const { result } = renderHook(() => useVoximplant());
    await waitFor(() => expect(fakeClient.init).toHaveBeenCalled());

    act(() => {
      result.current.callPSTN('+15551234567');
    });
    expect(fakeClient.call).toHaveBeenCalled();
    expect(result.current.callState).toBe('ringing');
  });

  it('toggleMute/hangup/sendDTMF delegate to call object', async () => {
    const { result } = renderHook(() => useVoximplant());
    await waitFor(() => expect(fakeClient.init).toHaveBeenCalled());

    const call = new FakeCall('in-3');
    act(() => fire('IncomingCall', { call }));
    act(() => call.trigger('Connected', {}));

    act(() => result.current.toggleMute());
    expect(call.muteMicrophone).toHaveBeenCalled();
    expect(result.current.muted).toBe(true);

    act(() => result.current.sendDTMF('5'));
    expect(call.sendDigits).toHaveBeenCalledWith('5');

    act(() => result.current.hangupCall());
    expect(call.hangup).toHaveBeenCalled();
  });

  it('clears call state on Disconnected', async () => {
    const { result } = renderHook(() => useVoximplant());
    await waitFor(() => expect(fakeClient.init).toHaveBeenCalled());

    const call = new FakeCall('in-4');
    act(() => fire('IncomingCall', { call }));
    act(() => call.trigger('Connected', {}));
    act(() => call.trigger('Disconnected', {}));
    expect(result.current.callState).toBe('ended');
  });

  it('setStatus calls setOperatorACDStatus', async () => {
    const { result } = renderHook(() => useVoximplant());
    await waitFor(() => expect(fakeClient.init).toHaveBeenCalled());

    await act(async () => {
      await result.current.setStatus('available');
    });
    expect(fakeClient.setOperatorACDStatus).toHaveBeenCalledWith('Ready');
  });
});
