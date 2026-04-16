'use client';

import { useState, useEffect } from 'react';
import { api } from '@/lib/api';
import { useCallEvents } from '@/hooks/useRealtimeEvents';

interface ActiveCall {
  id: string;
  status: string;
  callMode: string;
  toNumber: string;
  fromNumber: string;
  createdAt: string;
  agent: { id: string; firstName: string; lastName: string } | null;
  contact: { id: string; firstName: string; lastName: string; phone: string } | null;
  campaign: { id: string; name: string } | null;
}

export default function SupervisorPage() {
  const [activeCalls, setActiveCalls] = useState<ActiveCall[]>([]);
  const [monitoring, setMonitoring] = useState<Record<string, string>>({}); // callId -> mode

  useEffect(() => {
    loadActiveCalls();
    const interval = setInterval(loadActiveCalls, 5000);
    return () => clearInterval(interval);
  }, []);

  useCallEvents({
    onCallInitiated: () => loadActiveCalls(),
    onCallAnswered: () => loadActiveCalls(),
    onCallEnded: () => loadActiveCalls(),
  });

  async function loadActiveCalls() {
    try {
      const res = await api.get('/calls/active/list');
      setActiveCalls(res.data.calls);
    } catch (err) {
      console.error('Failed to load active calls:', err);
    }
  }

  async function joinCall(callId: string, mode: 'listen' | 'whisper' | 'barge') {
    try {
      await api.post(`/calls/${callId}/supervise`, { mode });
      setMonitoring((prev) => ({ ...prev, [callId]: mode }));
    } catch (err: any) {
      alert(err.response?.data?.error || 'Failed to join call');
    }
  }

  async function leaveCall(callId: string) {
    try {
      await api.post(`/calls/${callId}/supervise/leave`);
      setMonitoring((prev) => {
        const next = { ...prev };
        delete next[callId];
        return next;
      });
    } catch (err: any) {
      alert(err.response?.data?.error || 'Failed to leave call');
    }
  }

  function formatDuration(createdAt: string): string {
    const seconds = Math.floor((Date.now() - new Date(createdAt).getTime()) / 1000);
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  }

  const modeColors: Record<string, string> = {
    listen: 'bg-blue-100 text-blue-700',
    whisper: 'bg-yellow-100 text-yellow-700',
    barge: 'bg-red-100 text-red-700',
  };

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Supervisor Monitor</h1>

      <div className="bg-white rounded-xl shadow overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Active Calls ({activeCalls.length})</h2>
          <button
            onClick={loadActiveCalls}
            className="text-xs px-3 py-1 bg-gray-100 text-gray-600 rounded hover:bg-gray-200"
          >
            Refresh
          </button>
        </div>

        <table className="w-full">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Agent</th>
              <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Contact</th>
              <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Campaign</th>
              <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Mode</th>
              <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Duration</th>
              <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Status</th>
              <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {activeCalls.map((call) => {
              const currentMode = monitoring[call.id];
              return (
                <tr key={call.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 text-sm font-medium text-gray-900">
                    {call.agent ? `${call.agent.firstName} ${call.agent.lastName}` : 'AI Agent'}
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-600">
                    {call.contact
                      ? `${call.contact.firstName || ''} ${call.contact.lastName || ''}`
                      : call.toNumber}
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-600">
                    {call.campaign?.name || '-'}
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-600 capitalize">
                    {call.callMode}
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-600 font-mono">
                    {formatDuration(call.createdAt)}
                  </td>
                  <td className="px-6 py-4">
                    {currentMode ? (
                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${modeColors[currentMode]}`}>
                        {currentMode}
                      </span>
                    ) : (
                      <span className="px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-700">
                        {call.status}
                      </span>
                    )}
                  </td>
                  <td className="px-6 py-4">
                    {currentMode ? (
                      <button
                        onClick={() => leaveCall(call.id)}
                        className="text-xs px-3 py-1 bg-gray-100 text-gray-700 rounded hover:bg-gray-200"
                      >
                        Leave
                      </button>
                    ) : (
                      <div className="flex gap-1">
                        <button
                          onClick={() => joinCall(call.id, 'listen')}
                          className="text-xs px-2 py-1 bg-blue-50 text-blue-700 rounded hover:bg-blue-100"
                        >
                          Listen
                        </button>
                        <button
                          onClick={() => joinCall(call.id, 'whisper')}
                          className="text-xs px-2 py-1 bg-yellow-50 text-yellow-700 rounded hover:bg-yellow-100"
                        >
                          Whisper
                        </button>
                        <button
                          onClick={() => joinCall(call.id, 'barge')}
                          className="text-xs px-2 py-1 bg-red-50 text-red-700 rounded hover:bg-red-100"
                        >
                          Barge
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
            {activeCalls.length === 0 && (
              <tr>
                <td colSpan={7} className="px-6 py-8 text-center text-gray-400 text-sm">
                  No active calls. Calls will appear here when agents are on the phone.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
