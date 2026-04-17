'use client';

import Link from 'next/link';
import { ProgressBar } from './ProgressBar';
import { StatusBadge, CampaignStatus } from './StatusBadge';

export type DialMode = 'MANUAL' | 'PREVIEW' | 'PROGRESSIVE' | 'PREDICTIVE';

export type ContactStatusKey =
  | 'PENDING'
  | 'COMPLIANCE_BLOCKED'
  | 'DIALING'
  | 'CONNECTED'
  | 'COMPLETED'
  | 'FAILED'
  | 'MAX_ATTEMPTS';

export type CampaignStats = Record<ContactStatusKey, number>;

export interface CampaignListItem {
  id: string;
  name: string;
  status: CampaignStatus;
  dialMode: DialMode;
  stats: CampaignStats;
  scheduleStart: string | null;
  scheduleEnd: string | null;
  createdBy: string;
  createdAt: string;
}

function formatDateRange(start: string | null, end: string | null): string {
  if (!start && !end) return '—';
  const fmt = (s: string | null) =>
    s ? new Date(s).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : '…';
  return `${fmt(start)} → ${fmt(end)}`;
}

function capitalize(value: string): string {
  if (!value) return '';
  return value.charAt(0) + value.slice(1).toLowerCase();
}

function deriveProgress(stats: CampaignStats): { total: number; dialed: number } {
  const total =
    stats.PENDING +
    stats.COMPLIANCE_BLOCKED +
    stats.DIALING +
    stats.CONNECTED +
    stats.COMPLETED +
    stats.FAILED +
    stats.MAX_ATTEMPTS;
  const dialed =
    stats.DIALING + stats.CONNECTED + stats.COMPLETED + stats.FAILED + stats.MAX_ATTEMPTS;
  return { total, dialed };
}

export function CampaignRow({ c }: { c: CampaignListItem }) {
  const { total, dialed } = deriveProgress(c.stats);
  return (
    <tr className="border-b hover:bg-gray-50">
      <td className="py-3 px-4">
        <Link
          href={`/dashboard/campaigns/${c.id}`}
          className="text-blue-600 hover:underline font-medium"
        >
          {c.name}
        </Link>
      </td>
      <td className="py-3 px-4">
        <StatusBadge status={c.status} />
      </td>
      <td className="py-3 px-4 text-sm text-gray-700">{capitalize(c.dialMode)}</td>
      <td className="py-3 px-4 w-64">
        <ProgressBar value={dialed} total={total} />
      </td>
      <td className="py-3 px-4 text-sm text-gray-600 whitespace-nowrap">
        {formatDateRange(c.scheduleStart, c.scheduleEnd)}
      </td>
    </tr>
  );
}
