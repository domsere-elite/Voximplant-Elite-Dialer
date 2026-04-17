'use client';

import { useEffect, useState } from 'react';
import { useSocket } from '@/hooks/useSocket';
import type {
  IncomingCallEvent,
  CallConnectedEvent,
  CallEndedEvent,
  PreviewNextEvent,
  StatusChangedEvent
} from '@/types';

export function useRealtimeCall() {
  const { on } = useSocket();

  const [incomingCall, setIncomingCall] = useState<IncomingCallEvent | null>(null);
  const [activeCall, setActiveCall] = useState<CallConnectedEvent | null>(null);
  const [lastOutcome, setLastOutcome] = useState<CallEndedEvent | null>(null);
  const [previewContact, setPreviewContact] = useState<PreviewNextEvent | null>(null);
  const [statusChange, setStatusChange] = useState<StatusChangedEvent | null>(null);

  useEffect(() => {
    const offIncoming = on<IncomingCallEvent>('call:incoming', (payload) => {
      setIncomingCall(payload);
      setLastOutcome(null);
    });
    const offConnected = on<CallConnectedEvent>('call:connected', (payload) => {
      setActiveCall(payload);
      setIncomingCall(null);
      setLastOutcome(null);
    });
    const offEnded = on<CallEndedEvent>('call:ended', (payload) => {
      setLastOutcome(payload);
      setActiveCall(null);
      setIncomingCall(null);
    });
    const offPreview = on<PreviewNextEvent>('preview:next', (payload) => {
      setPreviewContact(payload);
    });
    const offStatus = on<StatusChangedEvent>('status:changed', (payload) => {
      setStatusChange(payload);
    });

    return () => {
      offIncoming?.();
      offConnected?.();
      offEnded?.();
      offPreview?.();
      offStatus?.();
    };
  }, [on]);

  return {
    incomingCall,
    activeCall,
    lastOutcome,
    previewContact,
    statusChange,
    clearIncoming: () => setIncomingCall(null),
    clearOutcome: () => setLastOutcome(null),
    clearPreview: () => setPreviewContact(null)
  };
}
