import { render, screen, waitFor, fireEvent, act } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

type TestRole = 'rep' | 'supervisor' | 'admin';
type TestAuthState = { user: { id: string; email: string; role: TestRole } | null };
let authState: TestAuthState = {
  user: { id: 'u1', email: 'a@b.com', role: 'supervisor' }
};

vi.mock('@/hooks/useAuth', () => ({ useAuth: () => authState }));

type ProgressHandler = (evt: Record<string, unknown>) => void;

const { apiGet, apiPost, socketOn, joinCampaign, registeredHandlers } = vi.hoisted(() => {
  const registeredHandlers = new Map<string, ProgressHandler>();
  return {
    apiGet: vi.fn(),
    apiPost: vi.fn(),
    socketOn: vi.fn((event: string, handler: ProgressHandler) => {
      registeredHandlers.set(event, handler);
      return () => registeredHandlers.delete(event);
    }),
    joinCampaign: vi.fn(),
    registeredHandlers
  };
});

vi.mock('@/lib/api', () => ({
  api: {
    get: apiGet,
    post: apiPost,
    patch: vi.fn(),
    interceptors: { request: { use: vi.fn() }, response: { use: vi.fn() } }
  }
}));

vi.mock('@/hooks/useSocket', () => ({
  useSocket: () => ({
    socket: null,
    connected: true,
    on: socketOn,
    emit: vi.fn(),
    joinCampaign
  })
}));

const { routerPush, paramsRef } = vi.hoisted(() => ({
  routerPush: vi.fn(),
  paramsRef: { current: { id: 'c1' } as { id: string } }
}));

vi.mock('next/navigation', () => ({
  useParams: () => paramsRef.current,
  useRouter: () => ({ push: routerPush })
}));

import CampaignDetailClient from '@/app/dashboard/campaigns/[id]/CampaignDetailClient';

const campaignDetailFixture = {
  id: 'c1',
  name: 'Alpha',
  status: 'ACTIVE',
  dialMode: 'PREDICTIVE',
  breakdown: {
    PENDING: 30,
    COMPLIANCE_BLOCKED: 2,
    DIALING: 3,
    CONNECTED: 20,
    COMPLETED: 15,
    FAILED: 10,
    MAX_ATTEMPTS: 5
  },
  createdAt: '2026-04-10T00:00:00Z'
};

function setupApiMock(overrides: {
  detail?: typeof campaignDetailFixture;
  liveMetrics?: unknown;
  contacts?: unknown[];
} = {}) {
  const detail = overrides.detail ?? campaignDetailFixture;
  const contacts = overrides.contacts ?? [];
  apiGet.mockImplementation((url: string) => {
    if (url.endsWith('/live-metrics')) {
      if (overrides.liveMetrics === undefined) {
        return Promise.reject(new Error('no live metrics endpoint'));
      }
      return Promise.resolve({ data: overrides.liveMetrics });
    }
    if (url.includes('/contacts')) {
      return Promise.resolve({ data: contacts });
    }
    return Promise.resolve({ data: detail });
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  registeredHandlers.clear();
  authState = { user: { id: 'u1', email: 'a@b.com', role: 'supervisor' } };
  paramsRef.current = { id: 'c1' };
  setupApiMock();
});

describe('CampaignDetailClient', () => {
  it('renders name, status badge, and derived stats', async () => {
    render(<CampaignDetailClient />);
    await waitFor(() => expect(screen.getByText('Alpha')).toBeInTheDocument());
    // Total = sum of all breakdown values = 30+2+3+20+15+10+5 = 85
    expect(screen.getByTestId('stat-total-contacts')).toHaveTextContent('85');
    // Pending
    expect(screen.getByTestId('stat-pending')).toHaveTextContent('30');
    // Dialed = DIALING+CONNECTED+COMPLETED+FAILED+MAX_ATTEMPTS = 3+20+15+10+5 = 53
    expect(screen.getByTestId('stat-dialed')).toHaveTextContent('53');
    // Connected = CONNECTED + COMPLETED = 35
    expect(screen.getByTestId('stat-connected')).toHaveTextContent('35');
    // Failed = FAILED + MAX_ATTEMPTS = 15
    expect(screen.getByTestId('stat-failed')).toHaveTextContent('15');
    // Compliance Blocked
    expect(screen.getByTestId('stat-compliance-blocked')).toHaveTextContent('2');
  });

  it('shows Pause and Stop buttons for supervisor on active campaign', async () => {
    render(<CampaignDetailClient />);
    await waitFor(() => expect(screen.getByText('Alpha')).toBeInTheDocument());
    expect(screen.getByRole('button', { name: 'Pause' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Stop' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Start' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Edit' })).not.toBeInTheDocument();
  });

  it('shows Start/Edit for DRAFT campaigns', async () => {
    setupApiMock({
      detail: { ...campaignDetailFixture, status: 'DRAFT' }
    });
    render(<CampaignDetailClient />);
    await waitFor(() => expect(screen.getByText('Alpha')).toBeInTheDocument());
    expect(screen.getByRole('button', { name: 'Start' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Edit' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Pause' })).not.toBeInTheDocument();
  });

  it('hides control buttons for reps', async () => {
    authState = { user: { id: 'u2', email: 'r@b.com', role: 'rep' } };
    render(<CampaignDetailClient />);
    await waitFor(() => expect(screen.getByText('Alpha')).toBeInTheDocument());
    expect(screen.queryByRole('button', { name: 'Pause' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Stop' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Start' })).not.toBeInTheDocument();
  });

  it('joins the campaign socket room on mount', async () => {
    render(<CampaignDetailClient />);
    await waitFor(() => expect(screen.getByText('Alpha')).toBeInTheDocument());
    expect(joinCampaign).toHaveBeenCalledWith('c1');
    expect(socketOn).toHaveBeenCalledWith('campaign:progress', expect.any(Function));
  });

  it('updates live metrics card on campaign:progress event', async () => {
    render(<CampaignDetailClient />);
    await waitFor(() => expect(screen.getByText('Alpha')).toBeInTheDocument());
    const handler = registeredHandlers.get('campaign:progress');
    expect(handler).toBeDefined();
    act(() => {
      handler?.({
        campaign_id: 'c1',
        total: 85,
        dialed: 60,
        connected: 40,
        failed: 12,
        abandon_rate: 0.0234
      });
    });
    await waitFor(() => {
      expect(screen.getByText(/2\.34%/)).toBeInTheDocument();
    });
  });

  it('ignores campaign:progress for other campaigns', async () => {
    render(<CampaignDetailClient />);
    await waitFor(() => expect(screen.getByText('Alpha')).toBeInTheDocument());
    const handler = registeredHandlers.get('campaign:progress');
    act(() => {
      handler?.({
        campaign_id: 'other',
        total: 100,
        dialed: 100,
        connected: 99,
        failed: 1,
        abandon_rate: 0.99
      });
    });
    // Nothing should change - no 99% card
    expect(screen.queryByText(/99\.00%/)).not.toBeInTheDocument();
  });

  it('POSTs to /start when action is resume', async () => {
    setupApiMock({ detail: { ...campaignDetailFixture, status: 'PAUSED' } });
    apiPost.mockResolvedValue({ data: { ok: true } });
    render(<CampaignDetailClient />);
    await waitFor(() => expect(screen.getByText('Alpha')).toBeInTheDocument());
    const resumeBtn = screen.getByRole('button', { name: 'Resume' });
    fireEvent.click(resumeBtn);
    await waitFor(() => {
      expect(apiPost).toHaveBeenCalledWith('/api/campaigns/c1/start');
    });
  });

  it('shows retry on load error', async () => {
    apiGet.mockRejectedValueOnce(new Error('boom'));
    render(<CampaignDetailClient />);
    expect(await screen.findByRole('button', { name: 'Retry' })).toBeInTheDocument();
    expect(screen.getByText(/boom/)).toBeInTheDocument();
  });
});
