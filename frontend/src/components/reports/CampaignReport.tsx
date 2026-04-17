'use client';

import { exportToCSV } from '@/lib/csv-export';

export interface CampaignRow {
  id: string;
  name: string;
  total_dialed: number;
  total_connected: number;
  connect_rate: number;
  amd_rate: number;
  avg_duration: number;
  abandon_rate: number;
  outcomes: Record<string, number>;
}

export function CampaignReport({ rows }: { rows: CampaignRow[] }) {
  function handleExport() {
    exportToCSV(
      'campaigns.csv',
      rows.map((r) => ({
        name: r.name,
        total_dialed: r.total_dialed,
        total_connected: r.total_connected,
        connect_rate: r.connect_rate,
        amd_rate: r.amd_rate,
        avg_duration: r.avg_duration,
        abandon_rate: r.abandon_rate,
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
          data-testid="campaign-export-btn"
        >
          Export CSV
        </button>
      </div>
      <table className="w-full text-sm border-collapse" data-testid="campaign-report-table">
        <thead className="bg-gray-50">
          <tr>
            <th className="text-left p-2">Campaign</th>
            <th className="text-right p-2">Dialed</th>
            <th className="text-right p-2">Connected</th>
            <th className="text-right p-2">Connect %</th>
            <th className="text-right p-2">AMD %</th>
            <th className="text-right p-2">Avg Dur</th>
            <th className="text-right p-2">Abandon %</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className="border-t">
              <td className="p-2 font-medium">{r.name}</td>
              <td className="p-2 text-right">{r.total_dialed}</td>
              <td className="p-2 text-right">{r.total_connected}</td>
              <td className="p-2 text-right">{(r.connect_rate * 100).toFixed(1)}%</td>
              <td className="p-2 text-right">{(r.amd_rate * 100).toFixed(1)}%</td>
              <td className="p-2 text-right">{r.avg_duration}s</td>
              <td className="p-2 text-right">{(r.abandon_rate * 100).toFixed(2)}%</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
