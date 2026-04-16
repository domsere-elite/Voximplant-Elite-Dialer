'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';
import { useAuth } from '@/hooks/useAuth';
import { CampaignRow, CampaignListItem } from '@/components/campaign/CampaignRow';

type Filter = 'all' | 'active' | 'draft' | 'completed';

const TABS: { key: Filter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'active', label: 'Active' },
  { key: 'draft', label: 'Draft' },
  { key: 'completed', label: 'Completed' }
];

export default function CampaignsClient() {
  const { user } = useAuth();
  const canCreate = !!user && (user.role === 'supervisor' || user.role === 'admin');

  const [campaigns, setCampaigns] = useState<CampaignListItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>('all');

  const load = useCallback(async () => {
    setError(null);
    setCampaigns(null);
    try {
      const { data } = await api.get<CampaignListItem[]>('/api/campaigns');
      setCampaigns(data);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to load campaigns');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = useMemo(() => {
    if (!campaigns) return [];
    if (filter === 'all') return campaigns;
    if (filter === 'active') {
      return campaigns.filter((c) => c.status === 'ACTIVE' || c.status === 'PAUSED');
    }
    if (filter === 'draft') {
      return campaigns.filter((c) => c.status === 'DRAFT');
    }
    return campaigns.filter((c) => c.status === 'COMPLETED');
  }, [campaigns, filter]);

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-semibold text-gray-900">Campaigns</h1>
        {canCreate && (
          <Link
            href="/dashboard/campaigns/new"
            data-testid="new-campaign-btn"
            className="inline-flex items-center px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 text-sm font-medium"
          >
            + New Campaign
          </Link>
        )}
      </div>

      <div className="border-b border-gray-200 mb-4">
        <nav className="flex space-x-6" role="tablist">
          {TABS.map((t) => (
            <button
              key={t.key}
              role="tab"
              aria-selected={filter === t.key}
              onClick={() => setFilter(t.key)}
              className={`py-2 px-1 border-b-2 text-sm font-medium transition ${
                filter === t.key
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-gray-600 hover:text-gray-900'
              }`}
            >
              {t.label}
            </button>
          ))}
        </nav>
      </div>

      {error && (
        <div className="rounded border border-red-200 bg-red-50 p-4 text-red-700 flex items-center justify-between">
          <span>Failed to load campaigns</span>
          <button
            onClick={() => void load()}
            className="px-3 py-1 bg-red-600 text-white rounded text-sm"
          >
            Retry
          </button>
        </div>
      )}

      {!error && campaigns === null && (
        <div className="space-y-2" data-testid="loading">
          {[0, 1, 2, 3, 4].map((i) => (
            <div key={i} className="h-12 bg-gray-100 rounded animate-pulse" />
          ))}
        </div>
      )}

      {!error && campaigns !== null && filtered.length === 0 && (
        <div className="text-center py-16 border border-dashed rounded">
          <p className="text-gray-500 mb-4">No campaigns yet</p>
          {canCreate && (
            <Link
              href="/dashboard/campaigns/new"
              className="inline-flex items-center px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 text-sm font-medium"
            >
              Create your first campaign
            </Link>
          )}
        </div>
      )}

      {!error && filtered.length > 0 && (
        <div className="bg-white rounded border overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-left text-xs uppercase text-gray-500">
              <tr>
                <th className="py-2 px-4">Name</th>
                <th className="py-2 px-4">Status</th>
                <th className="py-2 px-4">Dial Mode</th>
                <th className="py-2 px-4">Progress</th>
                <th className="py-2 px-4">Date Range</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((c) => (
                <CampaignRow key={c.id} c={c} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
