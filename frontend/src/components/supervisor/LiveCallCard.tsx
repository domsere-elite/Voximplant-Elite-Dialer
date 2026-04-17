'use client';

import { useEffect, useState } from 'react';

export interface LiveCall {
  id: string;
  agent_id: string;
  agent_name: string;
  agent_avatar_url?: string | null;
  consumer_phone: string;
  campaign_id: string;
  campaign_name: string;
  status: 'dialing' | 'ringing' | 'connected' | 'wrap_up';
  started_at: string;
}

interface Props {
  call: LiveCall;
  onListen: (callId: string) => void;
  onWhisper: (callId: string) => void;
  onBarge: (callId: string) => void;
  actionInFlight?: boolean;
}

function maskPhone(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  if (digits.length < 4) return phone;
  const last4 = digits.slice(-4);
  return `(XXX) XXX-${last4}`;
}

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export function LiveCallCard({ call, onListen, onWhisper, onBarge, actionInFlight }: Props) {
  const [duration, setDuration] = useState(0);

  useEffect(() => {
    const start = new Date(call.started_at).getTime();
    const tick = () => setDuration(Math.max(0, Math.floor((Date.now() - start) / 1000)));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [call.started_at]);

  const statusColor: Record<LiveCall['status'], string> = {
    dialing: 'bg-yellow-100 text-yellow-800',
    ringing: 'bg-blue-100 text-blue-800',
    connected: 'bg-green-100 text-green-800',
    wrap_up: 'bg-gray-100 text-gray-800',
  };

  return (
    <div className="border rounded-lg p-4 bg-white shadow-sm" data-testid={`call-card-${call.id}`}>
      <div className="flex items-center gap-3 mb-3">
        {call.agent_avatar_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={call.agent_avatar_url} alt={call.agent_name} className="w-10 h-10 rounded-full" />
        ) : (
          <div className="w-10 h-10 rounded-full bg-indigo-500 text-white flex items-center justify-center font-semibold">
            {call.agent_name.charAt(0).toUpperCase()}
          </div>
        )}
        <div className="flex-1">
          <div className="font-semibold text-sm">{call.agent_name}</div>
          <div className="text-xs text-gray-500">{call.campaign_name}</div>
        </div>
        <span className={`text-xs px-2 py-1 rounded ${statusColor[call.status]}`}>{call.status}</span>
      </div>

      <div className="flex justify-between text-sm mb-3">
        <span className="text-gray-600">{maskPhone(call.consumer_phone)}</span>
        <span className="font-mono text-gray-800">{formatDuration(duration)}</span>
      </div>

      <div className="flex gap-2">
        <button
          onClick={() => onListen(call.id)}
          disabled={actionInFlight}
          className="flex-1 text-xs px-2 py-1 border rounded hover:bg-gray-50 disabled:opacity-50"
          data-testid={`listen-${call.id}`}
        >
          Listen
        </button>
        <button
          onClick={() => onWhisper(call.id)}
          disabled={actionInFlight}
          className="flex-1 text-xs px-2 py-1 border rounded hover:bg-gray-50 disabled:opacity-50"
          data-testid={`whisper-${call.id}`}
        >
          Whisper
        </button>
        <button
          onClick={() => onBarge(call.id)}
          disabled={actionInFlight}
          className="flex-1 text-xs px-2 py-1 bg-red-600 text-white rounded hover:bg-red-700 disabled:opacity-50"
          data-testid={`barge-${call.id}`}
        >
          Barge
        </button>
      </div>
    </div>
  );
}
