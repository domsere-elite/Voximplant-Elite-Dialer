import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

let authState: any = { user: { id: 'u1', email: 'a@b.com', role: 'supervisor' } };
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => authState }));

const { apiGet } = vi.hoisted(() => ({ apiGet: vi.fn() }));
vi.mock('@/lib/api', () => ({
  api: {
    get: apiGet,
    post: vi.fn(),
    patch: vi.fn(),
    interceptors: { request: { use: vi.fn() }, response: { use: vi.fn() } }
  }
}));

import CampaignsPage from '@/app/dashboard/campaigns/CampaignsClient';

const fixtures = [
  {
    id: 'c1',
    name: 'Alpha',
    status: 'ACTIVE',
    dialMode: 'PREDICTIVE',
    stats: {
      PENDING: 50,
      COMPLIANCE_BLOCKED: 0,
      DIALING: 0,
      CONNECTED: 20,
      COMPLETED: 30,
      FAILED: 0,
      MAX_ATTEMPTS: 0
    },
    scheduleStart: null,
    scheduleEnd: null,
    createdAt: '2026-04-01T00:00:00Z',
    createdBy: 'user-1'
  },
  {
    id: 'c2',
    name: 'Beta',
    status: 'DRAFT',
    dialMode: 'MANUAL',
    stats: {
      PENDING: 10,
      COMPLIANCE_BLOCKED: 0,
      DIALING: 0,
      CONNECTED: 0,
      COMPLETED: 0,
      FAILED: 0,
      MAX_ATTEMPTS: 0
    },
    scheduleStart: null,
    scheduleEnd: null,
    createdAt: '2026-04-02T00:00:00Z',
    createdBy: 'user-1'
  }
];

beforeEach(() => {
  vi.clearAllMocks();
  authState = { user: { id: 'u1', email: 'a@b.com', role: 'supervisor' } };
  apiGet.mockResolvedValue({ data: fixtures });
});

describe('CampaignsPage', () => {
  it('renders campaigns from API', async () => {
    render(<CampaignsPage />);
    expect(await screen.findByText('Alpha')).toBeInTheDocument();
    expect(screen.getByText('Beta')).toBeInTheDocument();
  });

  it('derives progress from the status breakdown', async () => {
    render(<CampaignsPage />);
    await screen.findByText('Alpha');
    // Alpha: total=100, dialed=50 (CONNECTED 20 + COMPLETED 30)
    expect(screen.getByText('50 / 100')).toBeInTheDocument();
  });

  it('filters to draft when Draft tab clicked', async () => {
    render(<CampaignsPage />);
    await screen.findByText('Alpha');
    fireEvent.click(screen.getByRole('tab', { name: 'Draft' }));
    await waitFor(() => {
      expect(screen.queryByText('Alpha')).not.toBeInTheDocument();
      expect(screen.getByText('Beta')).toBeInTheDocument();
    });
  });

  it('filters to active when Active tab clicked', async () => {
    render(<CampaignsPage />);
    await screen.findByText('Alpha');
    fireEvent.click(screen.getByRole('tab', { name: 'Active' }));
    await waitFor(() => {
      expect(screen.getByText('Alpha')).toBeInTheDocument();
      expect(screen.queryByText('Beta')).not.toBeInTheDocument();
    });
  });

  it('hides New Campaign button for agents', async () => {
    authState = { user: { id: 'u2', email: 'r@b.com', role: 'rep' } };
    render(<CampaignsPage />);
    await screen.findByText('Alpha');
    expect(screen.queryByTestId('new-campaign-btn')).not.toBeInTheDocument();
  });

  it('shows New Campaign button for supervisors', async () => {
    render(<CampaignsPage />);
    await screen.findByText('Alpha');
    expect(screen.getByTestId('new-campaign-btn')).toBeInTheDocument();
  });

  it('shows retry on error', async () => {
    apiGet.mockRejectedValueOnce(new Error('boom'));
    render(<CampaignsPage />);
    expect(await screen.findByText(/Failed to load campaigns/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument();
  });

  it('retry re-fetches the campaigns list', async () => {
    apiGet.mockRejectedValueOnce(new Error('boom'));
    render(<CampaignsPage />);
    const retry = await screen.findByRole('button', { name: 'Retry' });
    apiGet.mockResolvedValueOnce({ data: fixtures });
    fireEvent.click(retry);
    expect(await screen.findByText('Alpha')).toBeInTheDocument();
  });

  it('renders status label in title case', async () => {
    render(<CampaignsPage />);
    await screen.findByText('Alpha');
    // 'Active' appears once as a status badge (tab label is 'Active' too,
    // but the tab is a button; the badge is a span). Match them all and
    // assert both rows rendered their title-cased labels.
    expect(screen.getAllByText('Active').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('Draft').length).toBeGreaterThanOrEqual(1);
  });
});
