'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import * as VoxMod from 'voximplant-websdk';
const VoxImplant: any = (VoxMod as any).default ?? (VoxMod as any).VoxImplant ?? VoxMod;
import { useAuthStore } from '@/stores/auth-store';
import type { AgentStatus } from '@/types';

export type SdkState = 'disconnected' | 'connecting' | 'ready' | 'error';
export type CallState = 'idle' | 'ringing' | 'active' | 'ended';

interface CustomData {
  autoAnswer?: boolean;
  crm_account_id?: string;
  campaign_id?: string;
}

function parseCustomData(call: any): CustomData {
  try {
    const raw = typeof call?.getCustomData === 'function' ? call.getCustomData() : call?.customData;
    if (!raw) return {};
    return JSON.parse(raw) as CustomData;
  } catch {
    return {};
  }
}

function mapAgentStatusToAcd(status: AgentStatus): string {
  const statuses = (VoxImplant as any).OperatorACDStatuses || {};
  switch (status) {
    case 'available':
      return statuses.Ready ?? 'Ready';
    case 'on_call':
      return statuses.InService ?? statuses.Ready ?? 'Ready';
    case 'wrap_up':
      return statuses.AfterService ?? 'AfterService';
    case 'break':
      return statuses.DND ?? 'DND';
    case 'offline':
    default:
      return statuses.Offline ?? 'Offline';
  }
}

interface UseVoximplantReturn {
  sdkState: SdkState;
  callState: CallState;
  currentCall: any | null;
  muted: boolean;
  onHold: boolean;
  durationSeconds: number;
  error: string | null;
  connect: () => Promise<void>;
  disconnect: () => Promise<void>;
  setStatus: (status: AgentStatus) => Promise<void>;
  callPSTN: (number: string, customData?: CustomData) => any | null;
  answerCall: () => void;
  hangupCall: () => void;
  toggleMute: () => void;
  toggleHold: () => void;
  sendDTMF: (digit: string) => void;
}

export function useVoximplant(): UseVoximplantReturn {
  const voximplantUser = useAuthStore((s) => s.voximplantUser);
  const [sdkState, setSdkState] = useState<SdkState>('disconnected');
  const [callState, setCallState] = useState<CallState>('idle');
  const [currentCall, setCurrentCall] = useState<any | null>(null);
  const [muted, setMuted] = useState(false);
  const [onHold, setOnHold] = useState(false);
  const [durationSeconds, setDurationSeconds] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const clientRef = useRef<any>(null);
  const clientListenersRef = useRef<Array<{ event: string; handler: (...args: any[]) => void }>>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const mountedRef = useRef(true);

  function detachClientListeners() {
    const client = clientRef.current;
    if (client?.off) {
      for (const { event, handler } of clientListenersRef.current) {
        try {
          client.off(event, handler);
        } catch {
          /* swallow */
        }
      }
    }
    clientListenersRef.current = [];
  }

  function registerClientListener(event: string, handler: (...args: any[]) => void) {
    const client = clientRef.current;
    if (!client) return;
    client.on(event, handler);
    clientListenersRef.current.push({ event, handler });
  }

  function stopTimer() {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }

  function startTimer() {
    stopTimer();
    setDurationSeconds(0);
    timerRef.current = setInterval(() => {
      setDurationSeconds((s) => s + 1);
    }, 1000);
  }

  const attachCallEvents = useCallback((call: any) => {
    const Events = (VoxImplant as any).CallEvents || {};

    const onConnected = () => {
      setCallState('active');
      startTimer();
    };
    const onDisconnected = () => {
      setCallState('ended');
      stopTimer();
      setCurrentCall(null);
      setMuted(false);
      setOnHold(false);
    };
    const onFailed = (e: any) => {
      setError(e?.reason || 'Call failed');
      setCallState('ended');
      stopTimer();
      setCurrentCall(null);
    };

    call.on(Events.Connected || 'Connected', onConnected);
    call.on(Events.Disconnected || 'Disconnected', onDisconnected);
    call.on(Events.Failed || 'Failed', onFailed);
  }, []);

  const connect = useCallback(async () => {
    if (!voximplantUser) return;
    if (!VoxImplant || typeof VoxImplant.getInstance !== 'function') {
      setSdkState('error');
      setError('Voximplant SDK not available');
      return;
    }
    const client = (VoxImplant as any).getInstance();
    clientRef.current = client;
    // Singleton client may already have our handlers attached from a prior
    // mount (StrictMode, HMR, logout/login). Remove them before re-attaching.
    detachClientListeners();
    setSdkState('connecting');
    setError(null);

    try {
      await client.init({ micRequired: true, videoSupport: false, showDebugInfo: false });
      await client.connect();

      const Events = (VoxImplant as any).Events || {};

      const onEstablished = async () => {
        try {
          await client.loginWithOneTimeKey(voximplantUser.username, voximplantUser.oneTimeKey);
          if (mountedRef.current) setSdkState('ready');
        } catch (err: any) {
          if (mountedRef.current) {
            setSdkState('error');
            setError(err?.message || 'Voximplant login failed');
          }
        }
      };

      const onConnectionFailed = (e: any) => {
        setSdkState('error');
        setError(e?.message || 'Voximplant connection failed');
      };

      const onIncoming = (evt: any) => {
        const call = evt?.call || evt;
        setCurrentCall(call);
        setCallState('ringing');
        attachCallEvents(call);
        const data = parseCustomData(call);
        if (data.autoAnswer && typeof call.answer === 'function') {
          try {
            call.answer();
          } catch {
            /* swallow */
          }
        }
      };

      registerClientListener(Events.ConnectionEstablished || 'ConnectionEstablished', onEstablished);
      registerClientListener(Events.ConnectionFailed || 'ConnectionFailed', onConnectionFailed);
      registerClientListener(Events.IncomingCall || 'IncomingCall', onIncoming);
    } catch (err: any) {
      setSdkState('error');
      setError(err?.message || 'SDK init failed');
    }
  }, [voximplantUser, attachCallEvents]);

  const disconnect = useCallback(async () => {
    stopTimer();
    detachClientListeners();
    const client = clientRef.current;
    if (client?.disconnect) {
      try {
        await client.disconnect();
      } catch {
        /* swallow */
      }
    }
    setSdkState('disconnected');
    setCallState('idle');
    setCurrentCall(null);
    setMuted(false);
    setOnHold(false);
    setDurationSeconds(0);
    setError(null);
  }, []);

  const setStatus = useCallback(async (status: AgentStatus) => {
    const client = clientRef.current;
    if (!client) return;
    await client.setOperatorACDStatus(mapAgentStatusToAcd(status));
  }, []);

  const callPSTN = useCallback(
    (number: string, customData?: CustomData) => {
      const client = clientRef.current;
      if (!client) return null;
      const call = client.call({
        number,
        video: false,
        customData: JSON.stringify(customData ?? { autoAnswer: false })
      });
      if (!call) return null;
      setCurrentCall(call);
      setCallState('ringing');
      attachCallEvents(call);
      return call;
    },
    [attachCallEvents]
  );

  const answerCall = useCallback(() => {
    if (currentCall?.answer) currentCall.answer();
  }, [currentCall]);

  const hangupCall = useCallback(() => {
    if (currentCall?.hangup) currentCall.hangup();
  }, [currentCall]);

  const toggleMute = useCallback(() => {
    if (!currentCall) return;
    if (muted) {
      currentCall.unmuteMicrophone?.();
      setMuted(false);
    } else {
      currentCall.muteMicrophone?.();
      setMuted(true);
    }
  }, [currentCall, muted]);

  const toggleHold = useCallback(() => {
    if (!currentCall?.hold) return;
    const next = !onHold;
    currentCall.hold(next);
    setOnHold(next);
  }, [currentCall, onHold]);

  const sendDTMF = useCallback(
    (digit: string) => {
      if (!currentCall) return;
      if (currentCall.sendDigits) currentCall.sendDigits(digit);
      else if (currentCall.sendTone) currentCall.sendTone(digit);
    },
    [currentCall]
  );

  useEffect(() => {
    mountedRef.current = true;
    if (voximplantUser) {
      connect();
    }
    return () => {
      mountedRef.current = false;
      stopTimer();
      disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [voximplantUser?.username, voximplantUser?.oneTimeKey]);

  return {
    sdkState,
    callState,
    currentCall,
    muted,
    onHold,
    durationSeconds,
    error,
    connect,
    disconnect,
    setStatus,
    callPSTN,
    answerCall,
    hangupCall,
    toggleMute,
    toggleHold,
    sendDTMF
  };
}
