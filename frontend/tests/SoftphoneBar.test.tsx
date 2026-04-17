import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

let voxState: any = {
  sdkState: 'ready',
  callState: 'idle',
  currentCall: null,
  muted: false,
  onHold: false,
  durationSeconds: 0,
  error: null,
  setStatus: vi.fn().mockResolvedValue(undefined),
  answerCall: vi.fn(),
  hangupCall: vi.fn(),
  toggleMute: vi.fn(),
  toggleHold: vi.fn(),
  callPSTN: vi.fn(),
  sendDTMF: vi.fn(),
  connect: vi.fn(),
  disconnect: vi.fn()
};

let realtimeState: any = {
  incomingCall: null,
  activeCall: null,
  lastOutcome: null,
  previewContact: null,
  statusChange: null,
  clearIncoming: vi.fn(),
  clearOutcome: vi.fn(),
  clearPreview: vi.fn()
};

vi.mock('@/hooks/useVoximplant', () => ({ useVoximplant: () => voxState }));
vi.mock('@/hooks/useRealtimeCall', () => ({ useRealtimeCall: () => realtimeState }));

const { apiPatch, apiPost, apiGet } = vi.hoisted(() => ({
  apiPatch: vi.fn().mockResolvedValue({ data: {} }),
  apiPost: vi.fn().mockResolvedValue({ data: {} }),
  apiGet: vi.fn().mockResolvedValue({ data: { dispositions: [{ code: 'PTP', label: 'Promise to Pay' }] } })
}));

vi.mock('@/lib/api', () => ({
  api: { patch: apiPatch, post: apiPost, get: apiGet, interceptors: { request: { use: vi.fn() }, response: { use: vi.fn() } } }
}));

import { SoftphoneBar } from '@/components/softphone/SoftphoneBar';

beforeEach(() => {
  voxState = {
    ...voxState,
    callState: 'idle',
    currentCall: null,
    muted: false,
    onHold: false,
    durationSeconds: 0
  };
  realtimeState = {
    incomingCall: null,
    activeCall: null,
    lastOutcome: null,
    previewContact: null,
    statusChange: null,
    clearIncoming: vi.fn(),
    clearOutcome: vi.fn(),
    clearPreview: vi.fn()
  };
  vi.clearAllMocks();
});

describe('SoftphoneBar', () => {
  it('idle state shows only status dropdown', () => {
    render(<SoftphoneBar />);
    expect(screen.getByLabelText(/status/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /end/i })).not.toBeInTheDocument();
  });

  it('ringing state shows accept and decline buttons', () => {
    voxState.callState = 'ringing';
    voxState.currentCall = { id: 'v1' };
    realtimeState.incomingCall = {
      voximplant_call_id: 'v1',
      from_number: '+15551234567',
      crm_account_id: 'acc-1',
      account_summary: { name: 'John Doe', balance: 2450 }
    };
    render(<SoftphoneBar />);
    expect(screen.getByRole('button', { name: /accept/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /decline/i })).toBeInTheDocument();
    expect(screen.getByText(/John Doe/i)).toBeInTheDocument();
  });

  it('active state shows mute/hold/end controls and CRM link', () => {
    voxState.callState = 'active';
    voxState.currentCall = { id: 'v1' };
    voxState.durationSeconds = 65;
    realtimeState.activeCall = { voximplant_call_id: 'v1', started_at: '2026-04-16T00:00:00Z', crm_account_id: 'acc-1' };
    render(<SoftphoneBar />);
    expect(screen.getByRole('button', { name: /mute/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /hold/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /end/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /open in crm/i })).toHaveAttribute('target', '_blank');
    expect(screen.getByText(/01:05/)).toBeInTheDocument();
  });

  it('wrap-up state shows Disposition button and opens modal', async () => {
    const user = userEvent.setup();
    realtimeState.lastOutcome = { voximplant_call_id: 'v1', call_id: 'c-42', duration_seconds: 90 };
    render(<SoftphoneBar />);
    const btn = screen.getByRole('button', { name: /disposition/i });
    await user.click(btn);
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('status change calls PATCH /api/agents/me/status and voximplant setStatus', async () => {
    const user = userEvent.setup();
    render(<SoftphoneBar />);
    const select = screen.getByLabelText(/status/i) as HTMLSelectElement;
    await user.selectOptions(select, 'break');
    expect(apiPatch).toHaveBeenCalledWith('/api/agents/me/status', { status: 'break' });
    expect(voxState.setStatus).toHaveBeenCalledWith('break');
  });
});
