'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import axios from 'axios';
import { api } from '@/lib/api';
import { useAuth } from '@/hooks/useAuth';
import { CampaignForm, CampaignFormValues } from '@/components/campaign/CampaignForm';
import { toCampaignPayload } from '@/components/campaign/payload';

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
      const { data } = await api.post<{ id: string }>('/api/campaigns', toCampaignPayload(values));
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
