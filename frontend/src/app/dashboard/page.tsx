'use client';

import { useState, useEffect } from 'react';
import { api } from '@/lib/api';
import { useCallEvents } from '@/hooks/useRealtimeEvents';

interface DashboardData {
  totalCallsToday: number;
  totalCallsAll: number;
  avgDurationToday: number;
  activeCampaigns: number;
  availableAgents: number;
  dispositionBreakdown: Array<{ dispositionCode: string; _count: number }>;
}

export default function DashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [recentEvents, setRecentEvents] = useState<Array<{ type: string; data: any; time: Date }>>([]);

  useEffect(() => {
    api.get('/reports/dashboard').then((res) => setData(res.data)).catch(console.error);
  }, []);

  // Real-time event feed
  useCallEvents({
    onCallInitiated: (d) => addEvent('Call Initiated', d),
    onCallAnswered: (d) => addEvent('Call Answered', d),
    onCallEnded: (d) => addEvent('Call Ended', d),
    onCallInbound: (d) => addEvent('Inbound Call', d),
    onAISummary: (d) => addEvent('AI Summary', d),
  });

  function addEvent(type: string, eventData: any) {
    setRecentEvents((prev) => [
      { type, data: eventData, time: new Date() },
      ...prev.slice(0, 19),
    ]);
  }

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Dashboard</h1>

      {/* Stats cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4 mb-8">
        <StatCard label="Calls Today" value={data?.totalCallsToday ?? '-'} />
        <StatCard label="Total Calls" value={data?.totalCallsAll ?? '-'} />
        <StatCard
          label="Avg Duration"
          value={data?.avgDurationToday ? `${Math.round(data.avgDurationToday)}s` : '-'}
        />
        <StatCard label="Active Campaigns" value={data?.activeCampaigns ?? '-'} />
        <StatCard label="Agents Available" value={data?.availableAgents ?? '-'} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Disposition breakdown */}
        <div className="bg-white rounded-xl shadow p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Today&apos;s Dispositions</h2>
          {data?.dispositionBreakdown && data.dispositionBreakdown.length > 0 ? (
            <div className="space-y-2">
              {data.dispositionBreakdown.map((d) => (
                <div key={d.dispositionCode} className="flex justify-between text-sm">
                  <span className="text-gray-600">{d.dispositionCode || 'None'}</span>
                  <span className="font-medium text-gray-900">{d._count}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-gray-400 text-sm">No dispositions today</p>
          )}
        </div>

        {/* Real-time event feed */}
        <div className="bg-white rounded-xl shadow p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Live Activity</h2>
          {recentEvents.length > 0 ? (
            <div className="space-y-2 max-h-80 overflow-y-auto">
              {recentEvents.map((event, i) => (
                <div key={i} className="flex items-center gap-3 text-sm py-1 border-b border-gray-50">
                  <span className="text-xs text-gray-400 w-16 flex-shrink-0">
                    {event.time.toLocaleTimeString()}
                  </span>
                  <span className="font-medium text-gray-700">{event.type}</span>
                  {event.data?.callId && (
                    <span className="text-xs text-gray-400 truncate">
                      {event.data.callId.slice(0, 8)}...
                    </span>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <p className="text-gray-400 text-sm">Waiting for activity...</p>
          )}
        </div>
      </div>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="bg-white rounded-xl shadow p-5">
      <div className="text-sm text-gray-500">{label}</div>
      <div className="text-2xl font-bold text-gray-900 mt-1">{value}</div>
    </div>
  );
}
