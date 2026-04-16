'use client';

export type CampaignStatus = 'DRAFT' | 'SCHEDULED' | 'ACTIVE' | 'PAUSED' | 'COMPLETED';

const COLORS: Record<CampaignStatus, string> = {
  DRAFT: 'bg-gray-100 text-gray-700 border-gray-200',
  SCHEDULED: 'bg-indigo-100 text-indigo-700 border-indigo-200',
  ACTIVE: 'bg-green-100 text-green-700 border-green-200',
  PAUSED: 'bg-yellow-100 text-yellow-700 border-yellow-200',
  COMPLETED: 'bg-blue-100 text-blue-700 border-blue-200'
};

function titleCase(status: string): string {
  if (!status) return '';
  return status.charAt(0) + status.slice(1).toLowerCase();
}

export function StatusBadge({ status }: { status: CampaignStatus | string }) {
  const key = (status in COLORS ? status : 'DRAFT') as CampaignStatus;
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${COLORS[key]}`}
    >
      {titleCase(status)}
    </span>
  );
}
