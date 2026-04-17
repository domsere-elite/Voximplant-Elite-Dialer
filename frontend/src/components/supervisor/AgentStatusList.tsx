'use client';

import { useEffect, useState } from 'react';

export type AgentStatus = 'available' | 'on_call' | 'wrap_up' | 'break' | 'offline';

export interface AgentState {
  id: string;
  name: string;
  status: AgentStatus;
  status_started_at: string;
}

const statusStyle: Record<AgentStatus, string> = {
  available: 'bg-green-100 text-green-800',
  on_call: 'bg-blue-100 text-blue-800',
  wrap_up: 'bg-yellow-100 text-yellow-800',
  break: 'bg-purple-100 text-purple-800',
  offline: 'bg-gray-100 text-gray-600',
};

function humanDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  if (m === 0) return `${s}s`;
  const h = Math.floor(m / 60);
  if (h === 0) return `${m}m ${s}s`;
  return `${h}h ${m % 60}m`;
}

export function AgentStatusList({ agents }: { agents: AgentState[] }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  return (
    <ul className="bg-white rounded-lg border divide-y">
      {agents.map((a) => {
        const elapsed = Math.max(0, Math.floor((now - new Date(a.status_started_at).getTime()) / 1000));
        return (
          <li key={a.id} className="p-3 flex items-center justify-between text-sm" data-testid={`agent-row-${a.id}`}>
            <span className="font-medium">{a.name}</span>
            <div className="flex items-center gap-3">
              <span className={`text-xs px-2 py-1 rounded ${statusStyle[a.status]}`}>{a.status}</span>
              <span className="text-gray-500 font-mono text-xs">{humanDuration(elapsed)}</span>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
