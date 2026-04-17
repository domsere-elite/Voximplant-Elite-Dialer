'use client';

export interface PhoneNumber {
  id: string;
  number: string;
  voximplantNumberId?: number | null;
  didGroupId?: string | null;
  areaCode: string;
  state?: string | null;
  isActive: boolean;
  healthScore: number;
  dailyCallCount: number;
  dailyCallLimit: number;
  lastUsedAt?: string | null;
  cooldownUntil?: string | null;
}

function healthBarColor(score: number): string {
  if (score >= 80) return 'bg-green-500';
  if (score >= 50) return 'bg-yellow-500';
  if (score >= 20) return 'bg-orange-500';
  return 'bg-red-500';
}

export function NumberTable({
  numbers,
  onRowClick,
  onToggleActive,
}: {
  numbers: PhoneNumber[];
  onRowClick: (n: PhoneNumber) => void;
  onToggleActive: (n: PhoneNumber, active: boolean) => void;
}) {
  if (numbers.length === 0) {
    return (
      <div className="text-center text-gray-500 py-12 border border-dashed rounded">
        No phone numbers configured.
      </div>
    );
  }
  return (
    <div className="bg-white border rounded overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="bg-gray-50 text-left text-xs uppercase text-gray-500">
          <tr>
            <th className="py-2 px-4">Number</th>
            <th className="py-2 px-4">Area Code</th>
            <th className="py-2 px-4">State</th>
            <th className="py-2 px-4 w-48">Health</th>
            <th className="py-2 px-4">Daily Usage</th>
            <th className="py-2 px-4">Cooldown</th>
            <th className="py-2 px-4">Active</th>
          </tr>
        </thead>
        <tbody>
          {numbers.map((n) => (
            <tr
              key={n.id}
              className="border-t hover:bg-gray-50 cursor-pointer"
              onClick={() => onRowClick(n)}
            >
              <td className="py-2 px-4 font-mono">{n.number}</td>
              <td className="py-2 px-4">{n.areaCode}</td>
              <td className="py-2 px-4">{n.state ?? ''}</td>
              <td className="py-2 px-4">
                <div className="flex items-center gap-2">
                  <div className="w-32 h-2 bg-gray-200 rounded overflow-hidden">
                    <div
                      className={`h-full ${healthBarColor(n.healthScore)}`}
                      style={{ width: `${Math.max(0, Math.min(100, n.healthScore))}%` }}
                    />
                  </div>
                  <span className="text-xs text-gray-600">{n.healthScore}</span>
                </div>
              </td>
              <td className="py-2 px-4">
                {n.dailyCallCount}/{n.dailyCallLimit}
              </td>
              <td className="py-2 px-4 text-xs">
                {n.cooldownUntil ? new Date(n.cooldownUntil).toLocaleString() : 'None'}
              </td>
              <td className="py-2 px-4" onClick={(e) => e.stopPropagation()}>
                <label className="inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={n.isActive}
                    onChange={(e) => onToggleActive(n, e.target.checked)}
                    aria-label={`Toggle active for ${n.number}`}
                  />
                </label>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
