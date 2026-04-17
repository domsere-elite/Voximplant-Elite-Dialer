'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import axios from 'axios';
import { api } from '@/lib/api';
import { useAuth } from '@/hooks/useAuth';
import {
  CampaignForm,
  CampaignFormValues,
  DEFAULTS,
} from '@/components/campaign/CampaignForm';
import { toCampaignPayload } from '@/components/campaign/payload';

function formatDateTimeLocal(value: unknown): string {
  if (value === null || value === undefined || value === '') return '';
  const d = new Date(value as string);
  if (Number.isNaN(d.getTime())) return '';
  // YYYY-MM-DDTHH:mm
  const pad = (n: number) => n.toString().padStart(2, '0');
  return (
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` +
    `T${pad(d.getHours())}:${pad(d.getMinutes())}`
  );
}

function toFormValues(raw: Record<string, unknown>): Partial<CampaignFormValues> {
  const str = (v: unknown): string => (typeof v === 'string' ? v : '');
  const num = (v: unknown, fallback: number): number =>
    typeof v === 'number' ? v : fallback;
  const bool = (v: unknown, fallback: boolean): boolean =>
    typeof v === 'boolean' ? v : fallback;

  const dialMode = (raw.dialMode as CampaignFormValues['dialMode']) ?? DEFAULTS.dialMode;
  const callerIdStrategy =
    (raw.callerIdStrategy as CampaignFormValues['callerIdStrategy']) ??
    DEFAULTS.callerIdStrategy;

  return {
    name: str(raw.name),
    dialMode,
    crmCampaignId: str(raw.crmCampaignId),
    didGroupId: str(raw.didGroupId),
    scheduleStart: formatDateTimeLocal(raw.scheduleStart),
    scheduleEnd: formatDateTimeLocal(raw.scheduleEnd),
    dialingHoursStart: str(raw.dialingHoursStart) || DEFAULTS.dialingHoursStart,
    dialingHoursEnd: str(raw.dialingHoursEnd) || DEFAULTS.dialingHoursEnd,
    timezone: str(raw.timezone) || DEFAULTS.timezone,
    maxConcurrentCalls: num(raw.maxConcurrentCalls, DEFAULTS.maxConcurrentCalls),
    maxAbandonRate: num(raw.maxAbandonRate, DEFAULTS.maxAbandonRate),
    dialRatio: num(raw.dialRatio, DEFAULTS.dialRatio),
    maxAttempts: num(raw.maxAttempts, DEFAULTS.maxAttempts),
    retryDelayMinutes: num(raw.retryDelayMinutes, DEFAULTS.retryDelayMinutes),
    callerIdStrategy,
    fixedCallerId: str(raw.fixedCallerId),
    amdEnabled: bool(raw.amdEnabled, DEFAULTS.amdEnabled),
    voicemailDropUrl: str(raw.voicemailDropUrl),
    autoAnswer: bool(raw.autoAnswer, DEFAULTS.autoAnswer),
  };
}

export default function EditCampaignClient() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const id = params?.id ?? '';
  const { user } = useAuth();
  const allowed = !!user && ['supervisor', 'admin'].includes(user.role);

  const [initial, setInitial] = useState<Partial<CampaignFormValues> | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!allowed || !id) return;
    void api
      .get<Record<string, unknown>>(`/api/campaigns/${id}`)
      .then((res) => setInitial(toFormValues(res.data)))
      .catch((e: unknown) =>
        setError(e instanceof Error ? e.message : 'Failed to load campaign'),
      );
  }, [id, allowed]);

  if (!allowed) return <div className="p-6 text-gray-600">Forbidden</div>;
  if (error)
    return (
      <div className="p-6 text-red-700 border border-red-200 bg-red-50 rounded">{error}</div>
    );
  if (!initial) return <div className="p-6 text-gray-500">Loading...</div>;

  async function handleSubmit(values: CampaignFormValues) {
    try {
      await api.patch(`/api/campaigns/${id}`, toCampaignPayload(values));
      router.push(`/dashboard/campaigns/${id}`);
    } catch (err: unknown) {
      if (axios.isAxiosError(err)) {
        const status = err.response?.status;
        const apiErr = err.response?.data as { error?: string } | undefined;
        if (status === 409) {
          throw new Error(apiErr?.error || 'Campaign cannot be edited in its current status');
        }
        throw new Error(apiErr?.error || 'Could not save');
      }
      throw err;
    }
  }

  return (
    <div className="p-6 max-w-4xl">
      <h1 className="text-2xl font-semibold text-gray-900 mb-6">Edit Campaign</h1>
      <CampaignForm
        initialValues={initial}
        onSubmit={handleSubmit}
        submitLabel="Save Changes"
      />
    </div>
  );
}
