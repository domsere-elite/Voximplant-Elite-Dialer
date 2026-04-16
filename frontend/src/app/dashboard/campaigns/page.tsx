'use client';

import { useState, useEffect } from 'react';
import { api } from '@/lib/api';

interface Campaign {
  id: string;
  name: string;
  status: string;
  dialMode: string;
  createdAt: string;
  _count: { contacts: number; attempts: number };
}

export default function CampaignsPage() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [showCreate, setShowCreate] = useState(false);

  useEffect(() => {
    loadCampaigns();
  }, []);

  async function loadCampaigns() {
    const res = await api.get('/campaigns');
    setCampaigns(res.data.campaigns);
  }

  async function handleAction(id: string, action: 'start' | 'pause' | 'stop') {
    await api.post(`/campaigns/${id}/${action}`);
    loadCampaigns();
  }

  const statusColors: Record<string, string> = {
    draft: 'bg-gray-100 text-gray-600',
    active: 'bg-green-100 text-green-700',
    paused: 'bg-yellow-100 text-yellow-700',
    completed: 'bg-blue-100 text-blue-700',
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Campaigns</h1>
        <button
          onClick={() => setShowCreate(true)}
          className="px-4 py-2 bg-primary-600 text-white rounded-lg text-sm font-medium hover:bg-primary-700"
        >
          New Campaign
        </button>
      </div>

      <div className="bg-white rounded-xl shadow overflow-hidden">
        <table className="w-full">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Name</th>
              <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Mode</th>
              <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Status</th>
              <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Contacts</th>
              <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Attempts</th>
              <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {campaigns.map((c) => (
              <tr key={c.id} className="hover:bg-gray-50">
                <td className="px-6 py-4 text-sm font-medium text-gray-900">{c.name}</td>
                <td className="px-6 py-4 text-sm text-gray-600 capitalize">{c.dialMode}</td>
                <td className="px-6 py-4">
                  <span className={`px-2 py-1 rounded-full text-xs font-medium ${statusColors[c.status] || 'bg-gray-100'}`}>
                    {c.status}
                  </span>
                </td>
                <td className="px-6 py-4 text-sm text-gray-600">{c._count.contacts}</td>
                <td className="px-6 py-4 text-sm text-gray-600">{c._count.attempts}</td>
                <td className="px-6 py-4 space-x-2">
                  {c.status === 'draft' || c.status === 'paused' ? (
                    <button
                      onClick={() => handleAction(c.id, 'start')}
                      className="text-xs px-3 py-1 bg-green-50 text-green-700 rounded hover:bg-green-100"
                    >
                      Start
                    </button>
                  ) : null}
                  {c.status === 'active' ? (
                    <>
                      <button
                        onClick={() => handleAction(c.id, 'pause')}
                        className="text-xs px-3 py-1 bg-yellow-50 text-yellow-700 rounded hover:bg-yellow-100"
                      >
                        Pause
                      </button>
                      <button
                        onClick={() => handleAction(c.id, 'stop')}
                        className="text-xs px-3 py-1 bg-red-50 text-red-700 rounded hover:bg-red-100"
                      >
                        Stop
                      </button>
                    </>
                  ) : null}
                </td>
              </tr>
            ))}
            {campaigns.length === 0 && (
              <tr>
                <td colSpan={6} className="px-6 py-8 text-center text-gray-400 text-sm">
                  No campaigns yet. Create one to get started.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
