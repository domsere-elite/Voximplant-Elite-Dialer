'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';

export type ContactStatusValue =
  | 'PENDING'
  | 'COMPLIANCE_BLOCKED'
  | 'DIALING'
  | 'CONNECTED'
  | 'COMPLETED'
  | 'FAILED'
  | 'MAX_ATTEMPTS';

export interface CampaignContact {
  id: string;
  campaignId: string;
  crmAccountId: string | null;
  phone: string;
  status: ContactStatusValue;
  priority: number;
  attempts: number;
  lastAttemptAt: string | null;
  lastOutcome: string | null;
  complianceCleared?: boolean;
}

function maskPhone(e164: string): string {
  if (!e164 || e164.length < 6) return e164;
  const last4 = e164.slice(-4);
  const country = e164.startsWith('+1') ? '+1' : e164.slice(0, 2);
  return `${country}${'\u2022'.repeat(Math.max(0, e164.length - country.length - 4))}${last4}`;
}

function titleCase(value: string): string {
  return value
    .toLowerCase()
    .split('_')
    .map((w) => (w ? w.charAt(0).toUpperCase() + w.slice(1) : w))
    .join(' ');
}

const STATUSES: Array<'all' | ContactStatusValue> = [
  'all',
  'PENDING',
  'COMPLIANCE_BLOCKED',
  'DIALING',
  'CONNECTED',
  'COMPLETED',
  'FAILED',
  'MAX_ATTEMPTS'
];

const PAGE_SIZE = 20;

export function ContactsTable({ campaignId }: { campaignId: string }) {
  const [status, setStatus] = useState<'all' | ContactStatusValue>('all');
  const [offset, setOffset] = useState(0);
  const [rows, setRows] = useState<CampaignContact[] | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let ignore = false;
    setRows(null);
    setError(null);
    api
      .get<CampaignContact[]>(`/api/campaigns/${campaignId}/contacts`, {
        params: {
          status: status === 'all' ? undefined : status,
          limit: PAGE_SIZE + 1,
          offset
        }
      })
      .then(({ data }) => {
        if (ignore) return;
        setHasMore(data.length > PAGE_SIZE);
        setRows(data.slice(0, PAGE_SIZE));
      })
      .catch((e: unknown) => {
        if (ignore) return;
        setError(e instanceof Error ? e.message : 'Failed to load contacts');
      });
    return () => {
      ignore = true;
    };
  }, [campaignId, status, offset]);

  return (
    <div className="bg-white border rounded">
      <div className="flex items-center justify-between p-3 border-b">
        <div className="flex items-center gap-2">
          <label className="text-sm text-gray-600" htmlFor="contacts-status-filter">
            Status:
          </label>
          <select
            id="contacts-status-filter"
            className="border rounded px-2 py-1 text-sm"
            value={status}
            onChange={(e) => {
              setOffset(0);
              setStatus(e.target.value as 'all' | ContactStatusValue);
            }}
          >
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {s === 'all' ? 'All' : titleCase(s)}
              </option>
            ))}
          </select>
        </div>
        <div className="flex items-center gap-2 text-sm">
          <button
            type="button"
            className="px-2 py-1 border rounded disabled:opacity-40"
            disabled={offset === 0}
            onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}
          >
            Prev
          </button>
          <span>Offset {offset}</span>
          <button
            type="button"
            className="px-2 py-1 border rounded disabled:opacity-40"
            disabled={!hasMore}
            onClick={() => setOffset(offset + PAGE_SIZE)}
          >
            Next
          </button>
        </div>
      </div>

      {error && <div className="p-4 text-red-700">{error}</div>}
      {!error && rows === null && <div className="p-4 text-gray-500">Loading...</div>}
      {!error && rows?.length === 0 && (
        <div className="p-6 text-center text-gray-500">No contacts match this filter.</div>
      )}

      {rows && rows.length > 0 && (
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-left text-xs uppercase text-gray-500">
            <tr>
              <th className="py-2 px-4">Phone</th>
              <th className="py-2 px-4">Account</th>
              <th className="py-2 px-4">Status</th>
              <th className="py-2 px-4">Attempts</th>
              <th className="py-2 px-4">Last Outcome</th>
              <th className="py-2 px-4">Last Attempt</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((c) => (
              <tr key={c.id} className="border-t">
                <td className="py-2 px-4 font-mono">{maskPhone(c.phone)}</td>
                <td className="py-2 px-4">{c.crmAccountId ?? '\u2014'}</td>
                <td className="py-2 px-4">{titleCase(c.status)}</td>
                <td className="py-2 px-4">{c.attempts}</td>
                <td className="py-2 px-4">{c.lastOutcome ?? '\u2014'}</td>
                <td className="py-2 px-4">
                  {c.lastAttemptAt ? new Date(c.lastAttemptAt).toLocaleString() : '\u2014'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
