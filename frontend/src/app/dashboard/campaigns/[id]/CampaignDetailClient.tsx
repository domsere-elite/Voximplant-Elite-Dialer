'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { useAuth } from '@/hooks/useAuth';
import { useSocket } from '@/hooks/useSocket';
import { StatusBadge, CampaignStatus } from '@/components/campaign/StatusBadge';
import { StatsGrid, StatCardValue } from '@/components/campaign/StatsGrid';
import { ContactsTable } from '@/components/campaign/ContactsTable';

type DialMode = 'MANUAL' | 'PREVIEW' | 'PROGRESSIVE' | 'PREDICTIVE';

type ContactStatusKey =
  | 'PENDING'
  | 'COMPLIANCE_BLOCKED'
  | 'DIALING'
  | 'CONNECTED'
  | 'COMPLETED'
  | 'FAILED'
  | 'MAX_ATTEMPTS';

type Breakdown = Record<ContactStatusKey, number>;

interface CampaignDetail {
  id: string;
  name: string;
  status: CampaignStatus;
  dialMode: DialMode;
  breakdown: Breakdown;
  createdAt?: string;
  updatedAt?: string;
}

interface LiveMetrics {
  abandonRate: number;
  dialed: number;
  connected: number;
  failed: number;
}

// Wire event field names STAY snake_case per standing correction #1.
interface ProgressEvent {
  campaign_id: string;
  total: number;
  dialed: number;
  connected: number;
  failed: number;
  abandon_rate: number;
}

const EMPTY_BREAKDOWN: Breakdown = {
  PENDING: 0,
  COMPLIANCE_BLOCKED: 0,
  DIALING: 0,
  CONNECTED: 0,
  COMPLETED: 0,
  FAILED: 0,
  MAX_ATTEMPTS: 0
};

function titleCase(value: string): string {
  return value
    .toLowerCase()
    .split('_')
    .map((w) => (w ? w.charAt(0).toUpperCase() + w.slice(1) : w))
    .join(' ');
}

function deriveTotals(breakdown: Breakdown): { total: number; dialed: number } {
  const total =
    breakdown.PENDING +
    breakdown.COMPLIANCE_BLOCKED +
    breakdown.DIALING +
    breakdown.CONNECTED +
    breakdown.COMPLETED +
    breakdown.FAILED +
    breakdown.MAX_ATTEMPTS;
  const dialed =
    breakdown.DIALING +
    breakdown.CONNECTED +
    breakdown.COMPLETED +
    breakdown.FAILED +
    breakdown.MAX_ATTEMPTS;
  return { total, dialed };
}

export default function CampaignDetailClient() {
  const params = useParams<{ id: string }>();
  const id = params?.id ?? '';
  const router = useRouter();
  const { user } = useAuth();
  const { on, joinCampaign } = useSocket();

  const canControl = !!user && ['supervisor', 'admin'].includes(user.role);

  const [campaign, setCampaign] = useState<CampaignDetail | null>(null);
  const [live, setLive] = useState<LiveMetrics | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [actionPending, setActionPending] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!id) return;
    setError(null);
    try {
      const cRes = await api.get<CampaignDetail>(`/api/campaigns/${id}`);
      setCampaign({
        ...cRes.data,
        breakdown: { ...EMPTY_BREAKDOWN, ...(cRes.data.breakdown ?? {}) }
      });
      // live-metrics endpoint is not yet implemented on the backend; tolerate absence.
      const lRes = await api
        .get<LiveMetrics>(`/api/campaigns/${id}/live-metrics`)
        .catch(() => ({ data: null as LiveMetrics | null }));
      if (lRes.data) setLive(lRes.data);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to load campaign');
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!id) return;
    joinCampaign(id);
    const off = on<ProgressEvent>('campaign:progress', (evt) => {
      if (evt.campaign_id !== id) return;
      setLive({
        abandonRate: evt.abandon_rate,
        dialed: evt.dialed,
        connected: evt.connected,
        failed: evt.failed
      });
      setCampaign((prev) =>
        prev
          ? {
              ...prev,
              breakdown: {
                ...prev.breakdown,
                CONNECTED: evt.connected,
                FAILED: evt.failed
              }
            }
          : prev
      );
    });
    return () => {
      off();
    };
  }, [on, joinCampaign, id]);

  async function runAction(action: 'start' | 'pause' | 'resume' | 'stop') {
    setActionPending(action);
    try {
      const endpoint = action === 'resume' ? 'start' : action;
      await api.post(`/api/campaigns/${id}/${endpoint}`);
      await load();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : `Failed to ${action}`);
    } finally {
      setActionPending(null);
    }
  }

  if (error)
    return (
      <div className="p-6">
        <div className="rounded border border-red-200 bg-red-50 p-4 text-red-700 flex items-center justify-between">
          <span>{error}</span>
          <button
            type="button"
            onClick={() => void load()}
            className="px-3 py-1 bg-red-600 text-white rounded text-sm"
          >
            Retry
          </button>
        </div>
      </div>
    );
  if (!campaign) return <div className="p-6 text-gray-500">Loading...</div>;

  const { total, dialed } = deriveTotals(campaign.breakdown);
  const connectedPlusCompleted = campaign.breakdown.CONNECTED + campaign.breakdown.COMPLETED;
  const failedPlusMax = campaign.breakdown.FAILED + campaign.breakdown.MAX_ATTEMPTS;

  const stats: StatCardValue[] = [
    { label: 'Total Contacts', value: total },
    { label: 'Pending', value: campaign.breakdown.PENDING },
    { label: 'Dialed', value: dialed },
    { label: 'Connected', value: connectedPlusCompleted, tone: 'good' },
    { label: 'Failed', value: failedPlusMax, tone: 'bad' },
    { label: 'Compliance Blocked', value: campaign.breakdown.COMPLIANCE_BLOCKED, tone: 'warn' }
  ];

  const showStart = canControl && ['DRAFT', 'SCHEDULED'].includes(campaign.status);
  const showPause = canControl && campaign.status === 'ACTIVE';
  const showResume = canControl && campaign.status === 'PAUSED';
  const showStop = canControl && ['ACTIVE', 'PAUSED'].includes(campaign.status);
  const showEdit = canControl && ['DRAFT', 'PAUSED'].includes(campaign.status);

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">{campaign.name}</h1>
          <div className="flex items-center gap-2 mt-1">
            <StatusBadge status={campaign.status} />
            <span className="text-xs px-2 py-0.5 border rounded-full bg-gray-50 text-gray-700">
              {titleCase(campaign.dialMode)}
            </span>
          </div>
        </div>
        <div className="flex gap-2">
          {showStart && (
            <button
              type="button"
              disabled={actionPending === 'start'}
              onClick={() => void runAction('start')}
              className="px-3 py-1.5 bg-green-600 text-white rounded text-sm disabled:opacity-50"
            >
              Start
            </button>
          )}
          {showPause && (
            <button
              type="button"
              disabled={actionPending === 'pause'}
              onClick={() => void runAction('pause')}
              className="px-3 py-1.5 bg-yellow-600 text-white rounded text-sm disabled:opacity-50"
            >
              Pause
            </button>
          )}
          {showResume && (
            <button
              type="button"
              disabled={actionPending === 'resume'}
              onClick={() => void runAction('resume')}
              className="px-3 py-1.5 bg-green-600 text-white rounded text-sm disabled:opacity-50"
            >
              Resume
            </button>
          )}
          {showStop && (
            <button
              type="button"
              disabled={actionPending === 'stop'}
              onClick={() => void runAction('stop')}
              className="px-3 py-1.5 bg-red-600 text-white rounded text-sm disabled:opacity-50"
            >
              Stop
            </button>
          )}
          {showEdit && (
            <button
              type="button"
              onClick={() => router.push(`/dashboard/campaigns/${id}/edit`)}
              className="px-3 py-1.5 border rounded text-sm"
            >
              Edit
            </button>
          )}
        </div>
      </div>

      <StatsGrid stats={stats} />

      {live !== null && campaign.dialMode === 'PREDICTIVE' && (
        <div className="rounded border p-4 bg-indigo-50">
          <div className="text-xs uppercase text-gray-500">Abandon Rate (live)</div>
          <div className="text-2xl font-semibold text-indigo-800">
            {(live.abandonRate * 100).toFixed(2)}%
          </div>
        </div>
      )}

      <section>
        <h2 className="text-lg font-semibold text-gray-900 mb-3">Contacts</h2>
        <ContactsTable campaignId={id} />
      </section>
    </div>
  );
}
