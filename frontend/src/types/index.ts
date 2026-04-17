export type UserRole = 'rep' | 'supervisor' | 'admin';

export interface User {
  id: string;
  email: string;
  role: UserRole;
  crmUserId: string;
  firstName?: string;
  lastName?: string;
}

export interface VoximplantUser {
  username: string;
  oneTimeKey: string;
  applicationName: string;
  accountName: string;
}

export interface AgentMapping {
  id: string;
  crmUserId: string;
  crmEmail: string;
  crmRole: UserRole;
  voximplantUserId: number;
  voximplantUsername: string;
  status: AgentStatus;
  currentCallId?: string | null;
  currentCampaignId?: string | null;
  skills: string[];
}

export type AgentStatus = 'available' | 'on_call' | 'wrap_up' | 'break' | 'offline';

export type CampaignStatus = 'draft' | 'scheduled' | 'active' | 'paused' | 'completed';
export type DialMode = 'manual' | 'preview' | 'progressive' | 'predictive';
export type CallerIdStrategy = 'fixed' | 'rotation' | 'proximity';

export interface Campaign {
  id: string;
  name: string;
  crmCampaignId?: string | null;
  status: CampaignStatus;
  dialMode: DialMode;
  autoAnswer: boolean;
  voximplantQueueId?: number | null;
  voximplantListId?: number | null;
  scheduleStart?: string | null;
  scheduleEnd?: string | null;
  dialingHoursStart: string;
  dialingHoursEnd: string;
  timezone: string;
  maxConcurrentCalls: number;
  maxAbandonRate: number;
  dialRatio: number;
  maxAttempts: number;
  retryDelayMinutes: number;
  didGroupId?: string | null;
  callerIdStrategy: CallerIdStrategy;
  fixedCallerId?: string | null;
  amdEnabled: boolean;
  voicemailDropUrl?: string | null;
  totalContacts: number;
  totalDialed: number;
  totalConnected: number;
  totalVoicemail: number;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export type CallDirection = 'inbound' | 'outbound';

export interface Call {
  id: string;
  voximplantCallId: string;
  campaignId?: string | null;
  contactId?: string | null;
  agentMappingId?: string | null;
  crmAccountId?: string | null;
  direction: CallDirection;
  fromNumber: string;
  toNumber: string;
  status: string;
  amdResult?: string | null;
  durationSeconds?: number | null;
  recordingUrl?: string | null;
  dispositionCode?: string | null;
  hangupReason?: string | null;
  createdAt: string;
  updatedAt: string;
}

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

export interface DIDGroup {
  id: string;
  name: string;
  createdAt: string;
}

export interface IncomingCallEvent {
  voximplant_call_id: string;
  from_number: string;
  crm_account_id?: string | null;
  account_summary?: {
    name?: string;
    balance?: number;
    lastOutcome?: string;
  } | null;
  campaign_name?: string | null;
}

export interface CallConnectedEvent {
  voximplant_call_id: string;
  started_at: string;
  crm_account_id?: string | null;
}

export interface CallEndedEvent {
  voximplant_call_id: string;
  call_id: string;
  duration_seconds: number;
  outcome?: string;
}

export interface PreviewNextEvent {
  crm_account_id: string;
  phone: string;
  account_summary?: {
    name?: string;
    balance?: number;
    lastOutcome?: string;
  } | null;
  campaign_id?: string | null;
  campaign_name?: string | null;
}

export interface StatusChangedEvent {
  status: AgentStatus;
}
