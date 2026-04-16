'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import axios from 'axios';
import { api } from '@/lib/api';
import { useAuth } from '@/hooks/useAuth';
import { CampaignForm, CampaignFormValues } from '@/components/campaign/CampaignForm';

interface CampaignSubmitPayload {
  name: string;
  dialMode: CampaignFormValues['dialMode'];
  crmCampaignId?: string;
  didGroupId: string;
  scheduleStart?: string;
  scheduleEnd?: string;
  dialingHoursStart: string;
  dialingHoursEnd: string;
  timezone: string;
  maxConcurrentCalls: number;
  maxAbandonRate: number;
  dialRatio: number;
  maxAttempts: number;
  retryDelayMinutes: number;
  callerIdStrategy: CampaignFormValues['callerIdStrategy'];
  fixedCallerId?: string;
  amdEnabled: boolean;
  voicemailDropUrl?: string;
  autoAnswer: boolean;
}

function toPayload(values: CampaignFormValues): CampaignSubmitPayload {
  const payload: CampaignSubmitPayload = {
    name: values.name,
    dialMode: values.dialMode,
    didGroupId: values.didGroupId,
    dialingHoursStart: values.dialingHoursStart,
    dialingHoursEnd: values.dialingHoursEnd,
    timezone: values.timezone,
    maxConcurrentCalls: values.maxConcurrentCalls,
    maxAbandonRate: values.maxAbandonRate,
    dialRatio: values.dialRatio,
    maxAttempts: values.maxAttempts,
    retryDelayMinutes: values.retryDelayMinutes,
    callerIdStrategy: values.callerIdStrategy,
    amdEnabled: values.amdEnabled,
    autoAnswer: values.autoAnswer,
  };
  if (values.crmCampaignId !== '') payload.crmCampaignId = values.crmCampaignId;
  if (values.scheduleStart !== '') payload.scheduleStart = values.scheduleStart;
  if (values.scheduleEnd !== '') payload.scheduleEnd = values.scheduleEnd;
  if (values.fixedCallerId !== '') payload.fixedCallerId = values.fixedCallerId;
  if (values.voicemailDropUrl !== '') payload.voicemailDropUrl = values.voicemailDropUrl;
  return payload;
}

export default function NewCampaignClient() {
  const router = useRouter();
  const { user } = useAuth();
  const allowed = !!user && ['supervisor', 'admin'].includes(user.role);

  useEffect(() => {
    if (user && !allowed) router.replace('/dashboard/campaigns');
  }, [user, allowed, router]);

  if (!allowed) {
    return <div className="p-6 text-gray-600">Forbidden</div>;
  }

  async function handleSubmit(values: CampaignFormValues) {
    try {
      const { data } = await api.post<{ id: string }>('/api/campaigns', toPayload(values));
      router.push(`/dashboard/campaigns/${data.id}`);
    } catch (err: unknown) {
      if (axios.isAxiosError(err)) {
        const apiErr = err.response?.data as { error?: string } | undefined;
        throw new Error(apiErr?.error || 'Could not save');
      }
      throw err;
    }
  }

  return (
    <div className="p-6 max-w-4xl">
      <h1 className="text-2xl font-semibold text-gray-900 mb-6">New Campaign</h1>
      <CampaignForm onSubmit={handleSubmit} submitLabel="Create Campaign" />
    </div>
  );
}
