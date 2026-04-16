'use client';

import { useEffect, useCallback, useRef } from 'react';
import { getSocket } from '@/lib/socket';

type EventHandler = (data: any) => void;

/**
 * Subscribe to real-time WebSocket events.
 * Automatically cleans up on unmount.
 */
export function useRealtimeEvents(events: Record<string, EventHandler>) {
  const handlersRef = useRef(events);
  handlersRef.current = events;

  useEffect(() => {
    const socket = getSocket();
    const entries = Object.entries(handlersRef.current);

    for (const [event, handler] of entries) {
      socket.on(event, handler);
    }

    return () => {
      for (const [event, handler] of entries) {
        socket.off(event, handler);
      }
    };
  }, []);
}

/**
 * Hook for real-time call notifications in the agent workspace.
 */
export function useCallEvents(handlers: {
  onCallInitiated?: EventHandler;
  onCallAnswered?: EventHandler;
  onCallEnded?: EventHandler;
  onCallInbound?: EventHandler;
  onAISummary?: EventHandler;
}) {
  useRealtimeEvents({
    'call:initiated': handlers.onCallInitiated || (() => {}),
    'call:answered': handlers.onCallAnswered || (() => {}),
    'call:ended': handlers.onCallEnded || (() => {}),
    'call:inbound': handlers.onCallInbound || (() => {}),
    'call:ai_summary': handlers.onAISummary || (() => {}),
  });
}
