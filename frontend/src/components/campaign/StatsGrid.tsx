'use client';

export interface StatCardValue {
  label: string;
  value: number | string;
  tone?: 'default' | 'good' | 'warn' | 'bad';
}

const TONES: Record<NonNullable<StatCardValue['tone']>, string> = {
  default: 'bg-white text-gray-900',
  good: 'bg-green-50 text-green-900',
  warn: 'bg-yellow-50 text-yellow-900',
  bad: 'bg-red-50 text-red-900'
};

export function StatsGrid({ stats }: { stats: StatCardValue[] }) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
      {stats.map((s) => (
        <div
          key={s.label}
          className={`rounded border p-4 ${TONES[s.tone ?? 'default']}`}
          data-testid={`stat-${s.label.replace(/\s+/g, '-').toLowerCase()}`}
        >
          <div className="text-xs uppercase tracking-wide text-gray-500">{s.label}</div>
          <div className="text-2xl font-semibold mt-1">{s.value}</div>
        </div>
      ))}
    </div>
  );
}
