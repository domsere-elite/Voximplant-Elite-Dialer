'use client';

import { useEffect, useMemo, useState } from 'react';
import clsx from 'clsx';
import { Mic, MicOff, PauseCircle, PhoneOff, PhoneCall, ExternalLink } from 'lucide-react';
import { useVoximplant } from '@/hooks/useVoximplant';
import { useRealtimeCall } from '@/hooks/useRealtimeCall';
import { api } from '@/lib/api';
import { StatusDropdown } from './StatusDropdown';
import { WrapUpModal } from './WrapUpModal';
import type { AgentStatus } from '@/types';

const CRM_URL = process.env.NEXT_PUBLIC_CRM_URL || '';

function formatDuration(secs: number): string {
  const m = Math.floor(secs / 60).toString().padStart(2, '0');
  const s = (secs % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}

function formatMoney(amount?: number | null): string {
  if (amount == null) return '';
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);
}

export function SoftphoneBar() {
  const vox = useVoximplant();
  const realtime = useRealtimeCall();
  const [status, setLocalStatus] = useState<AgentStatus>('available');
  const [wrapUpOpen, setWrapUpOpen] = useState(false);

  useEffect(() => {
    if (realtime.statusChange?.status) {
      setLocalStatus(realtime.statusChange.status);
    }
  }, [realtime.statusChange]);

  async function handleStatusChange(next: AgentStatus) {
    const prev = status;
    setLocalStatus(next);
    try {
      await api.patch('/api/agents/me/status', { status: next });
    } catch (err) {
      console.error('status PATCH failed', err);
      setLocalStatus(prev);
      return;
    }
    try {
      await vox.setStatus(next);
    } catch (err) {
      console.error('voximplant setStatus failed', err);
    }
  }

  const callerInfo = useMemo(() => {
    if (realtime.incomingCall) {
      return {
        phone: realtime.incomingCall.from_number,
        name: realtime.incomingCall.account_summary?.name,
        balance: realtime.incomingCall.account_summary?.balance,
        accountId: realtime.incomingCall.crm_account_id,
        campaign: realtime.incomingCall.campaign_name
      };
    }
    if (realtime.activeCall) {
      return {
        phone: undefined,
        name: undefined,
        balance: undefined,
        accountId: realtime.activeCall.crm_account_id,
        campaign: undefined
      };
    }
    return null;
  }, [realtime.incomingCall, realtime.activeCall]);

  const stage: 'idle' | 'ringing' | 'active' | 'wrap' =
    vox.callState === 'ringing'
      ? 'ringing'
      : vox.callState === 'active'
        ? 'active'
        : realtime.lastOutcome
          ? 'wrap'
          : 'idle';

  return (
    <>
      <div className="fixed bottom-0 left-0 right-0 z-40 bg-slate-900 text-white border-t border-slate-800 shadow-lg">
        <div className="max-w-screen-2xl mx-auto flex items-center justify-between gap-4 px-4 py-3">
          <div className="flex items-center gap-3 min-w-[180px]">
            <StatusDropdown value={status} onChange={handleStatusChange} />
            <span
              className={clsx(
                'h-2 w-2 rounded-full',
                vox.sdkState === 'ready' ? 'bg-success-500' : vox.sdkState === 'error' ? 'bg-danger-500' : 'bg-warning-500'
              )}
              title={vox.error ? `SDK: ${vox.sdkState} — ${vox.error}` : `SDK: ${vox.sdkState}`}
            />
          </div>

          <div className="flex-1 flex items-center justify-center gap-4 text-sm">
            {stage === 'idle' && (
              <span className="text-slate-400">Idle — waiting for calls</span>
            )}

            {stage === 'ringing' && callerInfo && (
              <div className="flex items-center gap-3">
                <span className="px-2 py-1 rounded bg-warning-500/20 text-warning-500 text-xs font-medium uppercase">
                  Ringing
                </span>
                <span className="font-medium">{callerInfo.name || 'Unknown caller'}</span>
                <span className="text-slate-400">{callerInfo.phone}</span>
                {callerInfo.balance != null && (
                  <span className="text-success-500">{formatMoney(callerInfo.balance)}</span>
                )}
              </div>
            )}

            {stage === 'active' && (
              <div className="flex items-center gap-3">
                <span className="px-2 py-1 rounded bg-success-500/20 text-success-500 text-xs font-medium uppercase">
                  On Call
                </span>
                {callerInfo?.name && <span className="font-medium">{callerInfo.name}</span>}
                <span className="tabular-nums text-slate-300">{formatDuration(vox.durationSeconds)}</span>
                {callerInfo?.accountId && (
                  <a
                    href={`${CRM_URL}/work/${callerInfo.accountId}`}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 text-primary-500 hover:text-primary-100"
                  >
                    <ExternalLink className="h-3 w-3" /> Open in CRM
                  </a>
                )}
              </div>
            )}

            {stage === 'wrap' && (
              <div className="flex items-center gap-3">
                <span className="px-2 py-1 rounded bg-primary-600/30 text-primary-100 text-xs font-medium uppercase">
                  Wrap-up
                </span>
                <button
                  type="button"
                  onClick={() => setWrapUpOpen(true)}
                  className="px-3 py-1 rounded-md bg-primary-600 hover:bg-primary-700 text-white text-sm"
                >
                  Disposition
                </button>
              </div>
            )}
          </div>

          <div className="flex items-center gap-2 min-w-[240px] justify-end">
            {stage === 'ringing' && (
              <>
                <button
                  type="button"
                  onClick={vox.answerCall}
                  className="inline-flex items-center gap-1 px-3 py-2 rounded-md bg-success-600 hover:bg-success-700 text-white text-sm"
                >
                  <PhoneCall className="h-4 w-4" /> Accept
                </button>
                <button
                  type="button"
                  onClick={vox.hangupCall}
                  className="inline-flex items-center gap-1 px-3 py-2 rounded-md bg-danger-600 hover:bg-danger-700 text-white text-sm"
                >
                  <PhoneOff className="h-4 w-4" /> Decline
                </button>
              </>
            )}
            {stage === 'active' && (
              <>
                <button
                  type="button"
                  onClick={vox.toggleMute}
                  className={clsx(
                    'inline-flex items-center gap-1 px-3 py-2 rounded-md text-sm',
                    vox.muted ? 'bg-warning-500 text-slate-900' : 'bg-slate-700 hover:bg-slate-600 text-white'
                  )}
                >
                  {vox.muted ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />} Mute
                </button>
                <button
                  type="button"
                  onClick={vox.toggleHold}
                  className={clsx(
                    'inline-flex items-center gap-1 px-3 py-2 rounded-md text-sm',
                    vox.onHold ? 'bg-warning-500 text-slate-900' : 'bg-slate-700 hover:bg-slate-600 text-white'
                  )}
                >
                  <PauseCircle className="h-4 w-4" /> Hold
                </button>
                <button
                  type="button"
                  onClick={vox.hangupCall}
                  className="inline-flex items-center gap-1 px-3 py-2 rounded-md bg-danger-600 hover:bg-danger-700 text-white text-sm"
                >
                  <PhoneOff className="h-4 w-4" /> End
                </button>
              </>
            )}
            {(stage === 'idle' || stage === 'wrap') && (
              <span className="text-xs text-slate-500">No active call</span>
            )}
          </div>
        </div>
      </div>

      {realtime.lastOutcome && (
        <WrapUpModal
          callId={realtime.lastOutcome.call_id}
          open={wrapUpOpen}
          onClose={() => setWrapUpOpen(false)}
          onSubmitted={() => realtime.clearOutcome()}
        />
      )}
    </>
  );
}
