'use client';

import { useState, useEffect } from 'react';
import { api } from '@/lib/api';

interface ComplianceReport {
  period: string;
  dncBlocked: number;
  tcpaBlocked: number;
  regfBlocked: number;
  totalAttempts: number;
  complianceRate: string;
}

interface AgentStat {
  agent: { id: string; firstName: string; lastName: string };
  callCount: number;
  avgDuration: number;
}

export default function ReportsPage() {
  const [compliance, setCompliance] = useState<ComplianceReport | null>(null);
  const [agentStats, setAgentStats] = useState<AgentStat[]>([]);

  useEffect(() => {
    api.get('/reports/compliance').then((r) => setCompliance(r.data)).catch(console.error);
    api.get('/reports/agents').then((r) => setAgentStats(r.data.agentStats)).catch(console.error);
  }, []);

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Reports</h1>

      {/* Compliance report */}
      <div className="bg-white rounded-xl shadow p-6 mb-8">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Compliance Report (7-day)</h2>
        {compliance ? (
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            <div>
              <div className="text-sm text-gray-500">Total Attempts</div>
              <div className="text-xl font-bold">{compliance.totalAttempts}</div>
            </div>
            <div>
              <div className="text-sm text-gray-500">DNC Blocked</div>
              <div className="text-xl font-bold text-red-600">{compliance.dncBlocked}</div>
            </div>
            <div>
              <div className="text-sm text-gray-500">TCPA Blocked</div>
              <div className="text-xl font-bold text-orange-600">{compliance.tcpaBlocked}</div>
            </div>
            <div>
              <div className="text-sm text-gray-500">Reg F Blocked</div>
              <div className="text-xl font-bold text-yellow-600">{compliance.regfBlocked}</div>
            </div>
            <div>
              <div className="text-sm text-gray-500">Compliance Rate</div>
              <div className="text-xl font-bold text-green-600">{compliance.complianceRate}%</div>
            </div>
          </div>
        ) : (
          <p className="text-gray-400 text-sm">Loading...</p>
        )}
      </div>

      {/* Agent performance */}
      <div className="bg-white rounded-xl shadow p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Agent Performance (Today)</h2>
        <table className="w-full">
          <thead className="border-b border-gray-200">
            <tr>
              <th className="text-left py-2 text-xs font-medium text-gray-500 uppercase">Agent</th>
              <th className="text-left py-2 text-xs font-medium text-gray-500 uppercase">Calls</th>
              <th className="text-left py-2 text-xs font-medium text-gray-500 uppercase">Avg Duration</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {agentStats.map((s) => (
              <tr key={s.agent.id}>
                <td className="py-3 text-sm">{s.agent.firstName} {s.agent.lastName}</td>
                <td className="py-3 text-sm">{s.callCount}</td>
                <td className="py-3 text-sm">{Math.round(s.avgDuration)}s</td>
              </tr>
            ))}
            {agentStats.length === 0 && (
              <tr>
                <td colSpan={3} className="py-4 text-center text-gray-400 text-sm">
                  No agent activity today
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
