import type { CampaignFormValues } from './CampaignForm';

export interface CampaignSubmitPayload {
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

export function toCampaignPayload(values: CampaignFormValues): CampaignSubmitPayload {
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
