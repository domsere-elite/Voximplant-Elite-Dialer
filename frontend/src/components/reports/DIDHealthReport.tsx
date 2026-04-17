'use client';

import { exportToCSV } from '@/lib/csv-export';

export interface DIDHealthRow {
  number: string;
  area_code: string | null;
  state: string | null;
  calls: number;
  connect_rate: number;
  health_score: number;
  daily_usage: Record<string, number>;
}

export function DIDHealthReport({ rows }: { rows: DIDHealthRow[] }) {
  function handleExport() {
    exportToCSV(
      'did-health.csv',
      rows.map((r) => ({
        number: r.number,
        area_code: r.area_code,
        state: r.state,
        calls: r.calls,
        connect_rate: r.connect_rate,
        health_score: r.health_score,
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
          data-testid="did-export-btn"
        >
          Export CSV
        </button>
      </div>
      <table className="w-full text-sm" data-testid="did-health-report-table">
        <thead className="bg-gray-50">
          <tr>
            <th className="text-left p-2">Number</th>
            <th className="text-left p-2">Area</th>
            <th className="text-left p-2">State</th>
            <th className="text-right p-2">Calls</th>
            <th className="text-right p-2">Connect %</th>
            <th className="text-right p-2">Health</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.number} className="border-t">
              <td className="p-2 font-mono">{r.number}</td>
              <td className="p-2">{r.area_code || '-'}</td>
              <td className="p-2">{r.state || '-'}</td>
              <td className="p-2 text-right">{r.calls}</td>
              <td className="p-2 text-right">{(r.connect_rate * 100).toFixed(1)}%</td>
              <td
                className={`p-2 text-right ${
                  r.health_score < 50
                    ? 'text-red-600'
                    : r.health_score < 75
                    ? 'text-yellow-700'
                    : 'text-green-700'
                }`}
              >
                {r.health_score}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
