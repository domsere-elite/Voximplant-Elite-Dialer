'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { Socket } from 'socket.io-client';
import { createSocket } from '@/lib/socket';
import { useAuthStore } from '@/stores/auth-store';

export function useSocket() {
  const token = useAuthStore((s) => s.token);
  const socketRef = useRef<Socket | null>(null);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    if (!token) return;
    const socket = createSocket(token);
    socketRef.current = socket;

    const onConnect = () => setConnected(true);
    const onDisconnect = () => setConnected(false);

    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);

    return () => {
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
      socket.disconnect();
      socketRef.current = null;
    };
  }, [token]);

  const on = useCallback(<T = any>(event: string, handler: (payload: T) => void) => {
    const s = socketRef.current;
    if (!s) return () => undefined;
    s.on(event, handler as any);
    return () => s.off(event, handler as any);
  }, []);

  const emit = useCallback((event: string, payload?: any) => {
    socketRef.current?.emit(event, payload);
  }, []);

  const joinCampaign = useCallback(
    (campaignId: string) => {
      emit('join:campaign', { campaignId });
    },
    [emit]
  );

  return {
    socket: socketRef.current,
    connected,
    on,
    emit,
    joinCampaign
  };
}
