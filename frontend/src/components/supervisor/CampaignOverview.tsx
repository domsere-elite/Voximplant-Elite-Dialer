'use client';

export interface CampaignProgress {
  campaign_id: string;
  name: string;
  agents_online: number;
  calls_in_progress: number;
  queue_depth: number;
  abandon_rate: number;
}

export function CampaignOverview({ campaigns }: { campaigns: CampaignProgress[] }) {
  if (campaigns.length === 0) {
    return <div className="text-sm text-gray-500 p-4">No active campaigns.</div>;
  }
  return (
    <div className="bg-white rounded-lg border">
      <table className="w-full text-sm">
        <thead className="bg-gray-50 text-gray-600 text-left">
          <tr>
            <th className="px-3 py-2">Campaign</th>
            <th className="px-3 py-2">Agents</th>
            <th className="px-3 py-2">Active</th>
            <th className="px-3 py-2">Queue</th>
            <th className="px-3 py-2">Abandon %</th>
          </tr>
        </thead>
        <tbody>
          {campaigns.map((c) => (
            <tr key={c.campaign_id} className="border-t" data-testid={`campaign-row-${c.campaign_id}`}>
              <td className="px-3 py-2 font-medium">{c.name}</td>
              <td className="px-3 py-2">{c.agents_online}</td>
              <td className="px-3 py-2">{c.calls_in_progress}</td>
              <td className="px-3 py-2">{c.queue_depth}</td>
              <td className={`px-3 py-2 ${c.abandon_rate > 0.03 ? 'text-red-600 font-semibold' : ''}`}>
                {(c.abandon_rate * 100).toFixed(2)}%
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
