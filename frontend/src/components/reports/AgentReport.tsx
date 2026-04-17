'use client';

import { exportToCSV } from '@/lib/csv-export';

export interface AgentRow {
  id: string;
  name: string;
  calls_handled: number;
  talk_time_seconds: number;
  avg_handle_time: number;
  connect_rate: number;
  dispositions: Record<string, number>;
}

export function AgentReport({ rows }: { rows: AgentRow[] }) {
  function handleExport() {
    exportToCSV(
      'agents.csv',
      rows.map((r) => ({
        name: r.name,
        calls_handled: r.calls_handled,
        talk_time_seconds: r.talk_time_seconds,
        avg_handle_time: r.avg_handle_time,
        connect_rate: r.connect_rate,
      })),
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <button
          type="button"
          onClick={handleExport}
          className="px-3 py-1 text-sm border rounded hover:bg-gray-50"
          data-testid="agent-export-btn"
        >
          Export CSV
        </button>
      </div>
      <table className="w-full text-sm" data-testid="agent-report-table">
        <thead className="bg-gray-50">
          <tr>
            <th className="text-left p-2">Agent</th>
            <th className="text-right p-2">Calls</th>
            <th className="text-right p-2">Talk Time</th>
            <th className="text-right p-2">AHT</th>
            <th className="text-right p-2">Connect %</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className="border-t">
              <td className="p-2 font-medium">{r.name}</td>
              <td className="p-2 text-right">{r.calls_handled}</td>
              <td className="p-2 text-right">{Math.round(r.talk_time_seconds / 60)}m</td>
              <td className="p-2 text-right">{r.avg_handle_time}s</td>
              <td className="p-2 text-right">{(r.connect_rate * 100).toFixed(1)}%</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
