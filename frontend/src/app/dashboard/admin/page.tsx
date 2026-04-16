'use client';

import { useState, useEffect } from 'react';
import { api } from '@/lib/api';

interface Agent {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: string;
  status: string;
  isActive: boolean;
}

export default function AdminPage() {
  const [agents, setAgents] = useState<Agent[]>([]);

  useEffect(() => {
    api.get('/agents').then((r) => setAgents(r.data.agents)).catch(console.error);
  }, []);

  const statusColors: Record<string, string> = {
    available: 'bg-green-100 text-green-700',
    on_call: 'bg-blue-100 text-blue-700',
    wrap_up: 'bg-purple-100 text-purple-700',
    busy: 'bg-yellow-100 text-yellow-700',
    break: 'bg-orange-100 text-orange-700',
    offline: 'bg-gray-100 text-gray-500',
  };

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Admin</h1>

      <div className="bg-white rounded-xl shadow overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-200">
          <h2 className="text-lg font-semibold">Agents & Users</h2>
        </div>
        <table className="w-full">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Name</th>
              <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Email</th>
              <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Role</th>
              <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Status</th>
              <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Active</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {agents.map((a) => (
              <tr key={a.id} className="hover:bg-gray-50">
                <td className="px-6 py-4 text-sm font-medium text-gray-900">
                  {a.firstName} {a.lastName}
                </td>
                <td className="px-6 py-4 text-sm text-gray-600">{a.email}</td>
                <td className="px-6 py-4 text-sm text-gray-600 capitalize">{a.role}</td>
                <td className="px-6 py-4">
                  <span className={`px-2 py-1 rounded-full text-xs font-medium ${statusColors[a.status] || 'bg-gray-100'}`}>
                    {a.status}
                  </span>
                </td>
                <td className="px-6 py-4 text-sm">
                  {a.isActive ? (
                    <span className="text-green-600">Active</span>
                  ) : (
                    <span className="text-red-600">Disabled</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
