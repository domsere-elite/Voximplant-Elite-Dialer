'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ExternalLink, Phone, SkipForward } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useRealtimeCall } from '@/hooks/useRealtimeCall';
import { api } from '@/lib/api';
import { WrapUpModal } from '@/components/softphone/WrapUpModal';
import type { AgentMapping } from '@/types';

const CRM_URL = process.env.NEXT_PUBLIC_CRM_URL || '';

interface AgentReport {
  calls_today: number;
  talk_time_seconds: number;
  connect_rate: number;
}

interface CallbackRow {
  id: string;
  account_name: string;
  phone: string;
  scheduled_at: string;
}

function formatTalkTime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h) return `${h}h ${m}m`;
  return `${m}m`;
}

function formatPercent(ratio: number): string {
  return `${Math.round(ratio * 100)}%`;
}

export default function DashboardClient() {
  const { user } = useAuth();
  const realtime = useRealtimeCall();
  const [mapping, setMapping] = useState<AgentMapping | null>(null);
  const [report, setReport] = useState<AgentReport | null>(null);
  const [callbacks, setCallbacks] = useState<CallbackRow[]>([]);
  const [dialing, setDialing] = useState(false);
  const [wrapOpen, setWrapOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const [mapRes, reportRes] = await Promise.all([
          api.get('/api/agents/me'),
          api.get('/api/reports/agents', { params: { agent_id: 'me', dateFrom: 'today' } }).catch(() => null)
        ]);
        if (cancelled) return;
        setMapping(mapRes.data ?? null);
        setReport(reportRes?.data ?? null);
      } catch {
        /* noop */
      }

      try {
        const cbRes = await api.get('/api/callbacks/upcoming', { params: { mine: true } });
        if (!cancelled) setCallbacks(cbRes.data?.callbacks ?? []);
      } catch {
        if (!cancelled) setCallbacks([]);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (realtime.lastOutcome) setWrapOpen(true);
  }, [realtime.lastOutcome]);

  const stage: 'idle' | 'preview' | 'active' | 'wrap' = useMemo(() => {
    if (realtime.activeCall) return 'active';
    if (realtime.previewContact) return 'preview';
    if (realtime.lastOutcome) return 'wrap';
    return 'idle';
  }, [realtime.activeCall, realtime.previewContact, realtime.lastOutcome]);

  async function handleDial() {
    const c = realtime.previewContact;
    if (!c) return;
    setDialing(true);
    try {
      await api.post('/api/calls/dial', { crmAccountId: c.crm_account_id, phone: c.phone });
    } finally {
      setDialing(false);
    }
  }

  async function handleSkip() {
    const c = realtime.previewContact;
    if (!c) return;
    try {
      await api.post('/api/calls/skip', { crmAccountId: c.crm_account_id });
    } catch {
      /* noop */
    } finally {
      realtime.clearPreview();
    }
  }

  return (
    <div className="space-y-6">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">
            Welcome back, {user?.firstName || user?.email?.split('@')[0] || 'there'}
          </h1>
          <p className="text-sm text-slate-500">
            {mapping?.status === 'available' ? 'Ready to take calls.' : `Current status: ${mapping?.status ?? 'loading'}`}
          </p>
        </div>
      </header>

      {stage === 'idle' && (
        <section className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <StatCard label="Calls Today" value={report?.calls_today ?? 0} />
            <StatCard
              label="Talk Time Today"
              value={report ? formatTalkTime(report.talk_time_seconds) : '0m'}
            />
            <StatCard
              label="Connect Rate"
              value={report ? formatPercent(report.connect_rate) : '0%'}
            />
          </div>

          <div className="bg-white rounded-lg border border-slate-200 shadow-sm">
            <div className="px-5 py-4 border-b border-slate-200">
              <h2 className="text-sm font-semibold text-slate-900">Upcoming callbacks</h2>
            </div>
            <div className="divide-y divide-slate-100">
              {callbacks.length === 0 ? (
                <div className="px-5 py-6 text-sm text-slate-500">No callbacks scheduled.</div>
              ) : (
                callbacks.map((cb) => (
                  <div key={cb.id} className="px-5 py-3 flex items-center justify-between text-sm">
                    <div>
                      <div className="font-medium text-slate-900">{cb.account_name}</div>
                      <div className="text-slate-500">{cb.phone}</div>
                    </div>
                    <div className="text-slate-500">{new Date(cb.scheduled_at).toLocaleString()}</div>
                  </div>
                ))
              )}
            </div>
          </div>
        </section>
      )}

      {stage === 'preview' && realtime.previewContact && (
        <section className="bg-white rounded-lg border border-slate-200 shadow-sm p-6 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-xs uppercase tracking-wide text-primary-600">
                {realtime.previewContact.campaign_name || 'Preview'}
              </div>
              <div className="text-2xl font-semibold text-slate-900">
                {realtime.previewContact.account_summary?.name || 'Unknown contact'}
              </div>
              <div className="text-sm text-slate-500">{realtime.previewContact.phone}</div>
            </div>
            <div className="text-right">
              <div className="text-xs text-slate-500">Account balance</div>
              <div className="text-xl font-semibold text-success-700">
                {realtime.previewContact.account_summary?.balance != null
                  ? new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(
                      realtime.previewContact.account_summary.balance
                    )
                  : '—'}
              </div>
            </div>
          </div>
          {realtime.previewContact.account_summary?.lastOutcome && (
            <div className="text-sm text-slate-600">
              Last outcome:{' '}
              <span className="font-medium">{realtime.previewContact.account_summary.lastOutcome}</span>
            </div>
          )}
          <div className="flex items-center gap-2 pt-2">
            <button
              type="button"
              onClick={handleDial}
              disabled={dialing}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-md bg-primary-600 hover:bg-primary-700 disabled:opacity-60 text-white text-sm font-medium"
            >
              <Phone className="h-4 w-4" />
              {dialing ? 'Dialing…' : 'Dial'}
            </button>
            <button
              type="button"
              onClick={handleSkip}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-md border border-slate-300 text-slate-700 hover:bg-slate-50 text-sm"
            >
              <SkipForward className="h-4 w-4" /> Skip
            </button>
            {realtime.previewContact.crm_account_id && (
              <Link
                href={`${CRM_URL}/work/${realtime.previewContact.crm_account_id}`}
                target="_blank"
                className="inline-flex items-center gap-2 px-4 py-2 rounded-md border border-slate-300 text-slate-700 hover:bg-slate-50 text-sm"
              >
                <ExternalLink className="h-4 w-4" /> Open in CRM
              </Link>
            )}
          </div>
        </section>
      )}

      {stage === 'active' && realtime.activeCall && (
        <section className="bg-white rounded-lg border border-slate-200 shadow-sm p-6 space-y-4">
          <div className="text-xs uppercase tracking-wide text-success-700">Call in progress</div>
          <div className="text-xl font-semibold text-slate-900">
            Voximplant call {realtime.activeCall.voximplant_call_id}
          </div>
          <div className="text-sm text-slate-500">
            Started at {new Date(realtime.activeCall.started_at).toLocaleTimeString()}
          </div>
          {realtime.activeCall.crm_account_id && (
            <Link
              href={`${CRM_URL}/work/${realtime.activeCall.crm_account_id}`}
              target="_blank"
              className="inline-flex items-center gap-2 px-4 py-2 rounded-md bg-primary-600 hover:bg-primary-700 text-white text-sm font-medium"
            >
              <ExternalLink className="h-4 w-4" /> Open Full Account in CRM
            </Link>
          )}
        </section>
      )}

      {stage === 'wrap' && realtime.lastOutcome && (
        <section className="bg-white rounded-lg border border-slate-200 shadow-sm p-6 space-y-3">
          <div className="text-xs uppercase tracking-wide text-primary-600">Wrap-up</div>
          <div className="text-lg font-semibold text-slate-900">Wrap up your last call</div>
          <p className="text-sm text-slate-500">
            Call {realtime.lastOutcome.call_id} — {realtime.lastOutcome.duration_seconds}s. Log the outcome
            to continue.
          </p>
          <button
            type="button"
            onClick={() => setWrapOpen(true)}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-md bg-primary-600 hover:bg-primary-700 text-white text-sm font-medium"
          >
            Open Disposition
          </button>
        </section>
      )}

      {realtime.lastOutcome && (
        <WrapUpModal
          callId={realtime.lastOutcome.call_id}
          open={wrapOpen}
          onClose={() => setWrapOpen(false)}
          onSubmitted={() => realtime.clearOutcome()}
        />
      )}
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="bg-white rounded-lg border border-slate-200 shadow-sm p-4">
      <div className="text-xs uppercase tracking-wide text-slate-500">{label}</div>
      <div className="mt-2 text-2xl font-semibold text-slate-900">{value}</div>
    </div>
  );
}
