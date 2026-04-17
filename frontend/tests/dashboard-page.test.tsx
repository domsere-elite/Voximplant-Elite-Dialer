import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

let authState: any = {
  user: { id: 'u1', email: 'a@b.com', role: 'rep', crmUserId: 'c1', firstName: 'Alex' },
  token: 'jwt',
  voximplantUser: null,
  status: 'authenticated',
  error: null,
  login: vi.fn(),
  logout: vi.fn(),
  initFromStorage: vi.fn()
};

vi.mock('@/hooks/useAuth', () => ({ useAuth: () => authState }));

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

vi.mock('@/hooks/useRealtimeCall', () => ({ useRealtimeCall: () => realtimeState }));

const { apiGet, apiPost } = vi.hoisted(() => ({ apiGet: vi.fn(), apiPost: vi.fn() }));
vi.mock('@/lib/api', () => ({
  api: {
    get: apiGet,
    post: apiPost,
    patch: vi.fn(),
    interceptors: { request: { use: vi.fn() }, response: { use: vi.fn() } }
  }
}));

import DashboardPage from '@/app/dashboard/page';

beforeEach(() => {
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
  apiGet.mockReset();
  apiPost.mockReset();

  apiGet.mockImplementation((url: string) => {
    if (url.includes('/api/agents/me')) {
      return Promise.resolve({
        data: {
          id: 'map-1',
          crmUserId: 'c1',
          crmEmail: 'a@b.com',
          crmRole: 'rep',
          voximplantUserId: 1,
          voximplantUsername: 'agent1@app.acc.voximplant.com',
          status: 'available',
          skills: []
        }
      });
    }
    if (url.includes('/api/reports/agents')) {
      return Promise.resolve({
        data: {
          calls_today: 12,
          talk_time_seconds: 3600,
          connect_rate: 0.42
        }
      });
    }
    if (url.includes('/api/dispositions')) {
      return Promise.resolve({ data: { dispositions: [] } });
    }
    return Promise.resolve({ data: {} });
  });
});

describe('DashboardPage', () => {
  it('idle: shows greeting and stat cards', async () => {
    render(<DashboardPage />);
    await waitFor(() => expect(screen.getByText(/welcome back, alex/i)).toBeInTheDocument());
    await waitFor(() => expect(screen.getByText(/calls today/i)).toBeInTheDocument());
    await waitFor(() => expect(screen.getByText(/12/)).toBeInTheDocument());
  });

  it('preview: shows contact card and dial button', async () => {
    realtimeState.previewContact = {
      crm_account_id: 'acc-1',
      phone: '+15551234567',
      account_summary: { name: 'Jane Roe', balance: 1800, lastOutcome: 'no_answer' },
      campaign_name: 'Q2 Outreach'
    };
    render(<DashboardPage />);
    expect(await screen.findByText(/jane roe/i)).toBeInTheDocument();
    const dialBtn = screen.getByRole('button', { name: /dial/i });
    await userEvent.setup().click(dialBtn);
    expect(apiPost).toHaveBeenCalledWith('/api/calls/dial', {
      crmAccountId: 'acc-1',
      phone: '+15551234567'
    });
  });

  it('active: shows on-call panel with open in CRM link', async () => {
    realtimeState.activeCall = {
      voximplant_call_id: 'v1',
      started_at: '2026-04-16T00:00:00Z',
      crm_account_id: 'acc-1'
    };
    render(<DashboardPage />);
    expect(await screen.findByText(/call in progress/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /open full account in crm/i })).toHaveAttribute(
      'target',
      '_blank'
    );
  });

  it('wrap-up: surfaces disposition prompt after call:ended', async () => {
    realtimeState.lastOutcome = { voximplant_call_id: 'v1', call_id: 'c-42', duration_seconds: 180 };
    render(<DashboardPage />);
    expect(await screen.findByText(/wrap up your last call/i)).toBeInTheDocument();
  });
});
