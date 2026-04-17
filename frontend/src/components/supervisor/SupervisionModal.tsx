'use client';

import { useState } from 'react';
import { api } from '@/lib/api';

type Mode = 'listen' | 'whisper' | 'barge';

interface Props {
  callId: string;
  initialMode: Mode;
  onClose: () => void;
}

export function SupervisionModal({ callId, initialMode, onClose }: Props) {
  const [mode, setMode] = useState<Mode>(initialMode);
  const [connected, setConnected] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function switchMode(next: Mode) {
    setBusy(true);
    setError(null);
    try {
      await api.post(`/api/calls/${callId}/supervise`, { mode: next });
      setMode(next);
      setConnected(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unknown error');
    } finally {
      setBusy(false);
    }
  }

  async function disconnect() {
    setBusy(true);
    try {
      await api.post(`/api/calls/${callId}/supervise`, { mode: 'disconnect' });
      setConnected(false);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unknown error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" data-testid="supervision-modal">
      <div className="bg-white rounded-lg p-6 w-96 shadow-lg">
        <h2 className="text-lg font-semibold mb-4">Supervising Call</h2>
        <div className="mb-4">
          <div className={`text-sm px-3 py-2 rounded ${connected ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-700'}`}>
            {connected ? `Connected as ${mode}` : 'Disconnected'}
          </div>
        </div>
        {error && <div className="text-sm text-red-600 mb-3">{error}</div>}
        <div className="flex gap-2 mb-4">
          {(['listen', 'whisper', 'barge'] as Mode[]).map((m) => (
            <button
              key={m}
              onClick={() => switchMode(m)}
              disabled={busy || mode === m}
              className={`flex-1 px-3 py-1 rounded border text-sm ${mode === m ? 'bg-indigo-600 text-white' : 'hover:bg-gray-50'} disabled:opacity-50`}
            >
              {m}
            </button>
          ))}
        </div>
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="px-3 py-1 border rounded text-sm">Close</button>
          <button onClick={disconnect} disabled={busy} className="px-3 py-1 bg-red-600 text-white rounded text-sm">Disconnect</button>
        </div>
      </div>
    </div>
  );
}
