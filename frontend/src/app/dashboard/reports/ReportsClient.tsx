'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { useAuth } from '@/hooks/useAuth';
import { DateRangePicker, DateRange } from '@/components/reports/DateRangePicker';
import { CampaignReport, CampaignRow } from '@/components/reports/CampaignReport';
import { AgentReport, AgentRow } from '@/components/reports/AgentReport';
import { DIDHealthReport, DIDHealthRow } from '@/components/reports/DIDHealthReport';

type Tab = 'campaigns' | 'agents' | 'did';

function defaultRange(): DateRange {
  const to = new Date();
  const from = new Date(to.getTime() - 7 * 86400000);
  return {
    dateFrom: from.toISOString().slice(0, 10),
    dateTo: to.toISOString().slice(0, 10),
  };
}

export default function ReportsClient() {
  const { user, status } = useAuth();
  const loading = status === 'idle' || status === 'loading';
  const allowed = !!user && (user.role === 'supervisor' || user.role === 'admin');

  const [tab, setTab] = useState<Tab>('campaigns');
  const [range, setRange] = useState<DateRange>(defaultRange);
  const [campaigns, setCampaigns] = useState<CampaignRow[] | null>(null);
  const [agents, setAgents] = useState<AgentRow[] | null>(null);
  const [numbers, setNumbers] = useState<DIDHealthRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!allowed) return;
    let ignore = false;
    setError(null);
    const params = { dateFrom: range.dateFrom, dateTo: range.dateTo };
    Promise.all([
      api.get<{ campaigns: CampaignRow[] }>('/api/reports/campaigns', { params }),
      api.get<{ agents: AgentRow[] }>('/api/reports/agents', { params }),
      api.get<{ numbers: DIDHealthRow[] }>('/api/reports/did-health', { params }),
    ])
      .then(([c, a, n]) => {
        if (ignore) return;
        setCampaigns(c.data.campaigns || []);
        setAgents(a.data.agents || []);
        setNumbers(n.data.numbers || []);
      })
      .catch((e: unknown) => {
        if (ignore) return;
        setError(e instanceof Error ? e.message : 'Failed to load reports');
      });
    return () => {
      ignore = true;
    };
  }, [allowed, range.dateFrom, range.dateTo]);

  if (loading || !user) return <div className="p-6 text-gray-500">Loading...</div>;
  if (!allowed) return <div className="p-6 text-gray-600">Forbidden</div>;

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-gray-900">Reports</h1>
        <DateRangePicker value={range} onChange={setRange} />
      </div>

      <div className="border-b">
        <nav className="flex gap-6" role="tablist">
          {(['campaigns', 'agents', 'did'] as const).map((key) => (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={tab === key}
              onClick={() => setTab(key)}
              className={`py-2 border-b-2 text-sm font-medium ${
                tab === key
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-gray-600 hover:text-gray-900'
              }`}
            >
              {key === 'campaigns' ? 'Campaigns' : key === 'agents' ? 'Agents' : 'DID Health'}
            </button>
          ))}
        </nav>
      </div>

      {error && (
        <div className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {tab === 'campaigns' &&
        (campaigns === null ? (
          <div className="text-gray-500">Loading...</div>
        ) : (
          <CampaignReport rows={campaigns} />
        ))}

      {tab === 'agents' &&
        (agents === null ? (
          <div className="text-gray-500">Loading...</div>
        ) : (
          <AgentReport rows={agents} />
        ))}

      {tab === 'did' &&
        (numbers === null ? (
          <div className="text-gray-500">Loading...</div>
        ) : (
          <DIDHealthReport rows={numbers} />
        ))}
    </div>
  );
}
