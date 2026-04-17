'use client';

import { useEffect, useState, useCallback } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useSocket } from '@/hooks/useSocket';
import { LiveCallCard, LiveCall } from '@/components/supervisor/LiveCallCard';
import { SupervisionModal } from '@/components/supervisor/SupervisionModal';
import { CampaignOverview, CampaignProgress } from '@/components/supervisor/CampaignOverview';
import { AgentStatusList, AgentState } from '@/components/supervisor/AgentStatusList';
import { api } from '@/lib/api';

type Mode = 'listen' | 'whisper' | 'barge';

interface Alert {
  id: string;
  type: 'abandon_rate' | 'compliance_block';
  message: string;
}

export default function SupervisorClient() {
  const { user, status } = useAuth();
  const { on } = useSocket();

  const loading = status === 'idle' || status === 'loading';
  const allowed = !!user && (user.role === 'supervisor' || user.role === 'admin');

  const [calls, setCalls] = useState<LiveCall[]>([]);
  const [campaigns, setCampaigns] = useState<CampaignProgress[]>([]);
  const [agents, setAgents] = useState<AgentState[]>([]);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [supervising, setSupervising] = useState<{ callId: string; mode: Mode } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Initial load
  useEffect(() => {
    if (!allowed) return;
    let ignore = false;
    api
      .get<{ calls?: LiveCall[] }>('/api/calls/active')
      .then((res) => {
        if (!ignore) setCalls(res.data.calls || []);
      })
      .catch((e: unknown) => {
        if (!ignore) setError(e instanceof Error ? e.message : 'Failed to load active calls');
      });
    return () => {
      ignore = true;
    };
  }, [allowed]);

  // Socket listeners
  useEffect(() => {
    if (!allowed) return;

    const onLiveUpdate = (call: LiveCall & { ended?: boolean }) => {
      setCalls((prev) => {
        if (call.ended) return prev.filter((c) => c.id !== call.id);
        const idx = prev.findIndex((c) => c.id === call.id);
        if (idx === -1) return [...prev, call];
        const next = [...prev];
        next[idx] = call;
        return next;
      });
    };

    const onCampaignProgress = (p: CampaignProgress) => {
      setCampaigns((prev) => {
        const idx = prev.findIndex((c) => c.campaign_id === p.campaign_id);
        if (idx === -1) return [...prev, p];
        const next = [...prev];
        next[idx] = p;
        return next;
      });
    };

    const onAgentStatus = (a: AgentState) => {
      setAgents((prev) => {
        const idx = prev.findIndex((x) => x.id === a.id);
        if (idx === -1) return [...prev, a];
        const next = [...prev];
        next[idx] = a;
        return next;
      });
    };

    const pushAlert = (type: Alert['type'], message: string) => {
      const id = `${type}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      setAlerts((prev) => [...prev, { id, type, message }]);
      setTimeout(() => setAlerts((prev) => prev.filter((al) => al.id !== id)), 10000);
    };

    const onAbandon = (d: { campaign_name: string; rate: number }) =>
      pushAlert('abandon_rate', `Abandon rate ${(d.rate * 100).toFixed(2)}% on ${d.campaign_name}`);
    const onCompliance = (d: { reason: string }) =>
      pushAlert('compliance_block', `Compliance block: ${d.reason}`);

    const unsubs = [
      on<LiveCall & { ended?: boolean }>('call:live_update', onLiveUpdate),
      on<CampaignProgress>('campaign:progress', onCampaignProgress),
      on<AgentState>('agent:status_change', onAgentStatus),
      on<{ campaign_name: string; rate: number }>('alert:abandon_rate', onAbandon),
      on<{ reason: string }>('alert:compliance_block', onCompliance),
    ];

    return () => {
      unsubs.forEach((u) => u && u());
    };
  }, [allowed, on]);

  const triggerSupervise = useCallback(async (callId: string, mode: Mode) => {
    setBusy(true);
    try {
      await api.post(`/api/calls/${callId}/supervise`, { mode });
      setSupervising({ callId, mode });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Supervise failed');
    } finally {
      setBusy(false);
    }
  }, []);

  const dismissAlert = (id: string) => setAlerts((prev) => prev.filter((a) => a.id !== id));

  if (loading || !user) return <div className="p-6 text-gray-500">Loading...</div>;
  if (!allowed) return <div className="p-6 text-gray-600">Forbidden</div>;

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-2xl font-bold">Supervisor Monitor</h1>

      {error && (
        <div className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="space-y-2">
        {alerts.map((a) => (
          <div
            key={a.id}
            className={`p-3 rounded flex justify-between items-center ${
              a.type === 'abandon_rate'
                ? 'bg-red-100 border border-red-300 text-red-800'
                : 'bg-yellow-100 border border-yellow-300 text-yellow-800'
            }`}
            data-testid={`alert-${a.type}`}
          >
            <span className="text-sm">{a.message}</span>
            <button onClick={() => dismissAlert(a.id)} className="text-xs underline">
              dismiss
            </button>
          </div>
        ))}
      </div>

      <section>
        <h2 className="text-lg font-semibold mb-3">Active Calls ({calls.length})</h2>
        {calls.length === 0 ? (
          <div className="text-gray-500 text-sm">No active calls.</div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {calls.map((c) => (
              <LiveCallCard
                key={c.id}
                call={c}
                onListen={(id) => void triggerSupervise(id, 'listen')}
                onWhisper={(id) => void triggerSupervise(id, 'whisper')}
                onBarge={(id) => void triggerSupervise(id, 'barge')}
                actionInFlight={busy}
              />
            ))}
          </div>
        )}
      </section>

      <section>
        <h2 className="text-lg font-semibold mb-3">Campaigns</h2>
        <CampaignOverview campaigns={campaigns} />
      </section>

      <section>
        <h2 className="text-lg font-semibold mb-3">Agents</h2>
        <AgentStatusList agents={agents} />
      </section>

      {supervising && (
        <SupervisionModal
          callId={supervising.callId}
          initialMode={supervising.mode}
          onClose={() => setSupervising(null)}
        />
      )}
    </div>
  );
}
