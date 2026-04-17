import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

type TestAuthState = {
  user: { id: string; email: string; role: 'rep' | 'supervisor' | 'admin' } | null;
  status: 'idle' | 'loading' | 'authenticated' | 'unauthenticated';
};
let authState: TestAuthState = {
  user: { id: 'u1', email: 'a@b.com', role: 'admin' },
  status: 'authenticated',
};
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => authState }));

const { socketOn } = vi.hoisted(() => ({
  socketOn: vi.fn(() => () => undefined),
}));
vi.mock('@/hooks/useSocket', () => ({
  useSocket: () => ({
    socket: null,
    connected: false,
    on: socketOn,
    emit: vi.fn(),
    joinCampaign: vi.fn(),
  }),
}));

const { apiGet, apiPost, apiPatch, apiDelete } = vi.hoisted(() => ({
  apiGet: vi.fn(),
  apiPost: vi.fn(),
  apiPatch: vi.fn(),
  apiDelete: vi.fn(),
}));
vi.mock('@/lib/api', () => ({
  api: {
    get: apiGet,
    post: apiPost,
    patch: apiPatch,
    delete: apiDelete,
    interceptors: { request: { use: vi.fn() }, response: { use: vi.fn() } },
  },
}));

import SettingsClient from '@/app/dashboard/settings/SettingsClient';

const defaultSettings: Record<string, string> = {
  'tcpa.window_start': '08:00',
  'tcpa.window_end': '21:00',
  'tcpa.default_timezone': 'UTC',
  'amd.enabled': 'true',
  'amd.vm_drop_url': 'https://example.com/vm.mp3',
  'retry.max_attempts': '3',
  'retry.delay_minutes': '30',
};

beforeEach(() => {
  apiGet.mockReset();
  apiPost.mockReset();
  apiPatch.mockReset();
  apiDelete.mockReset();
  socketOn.mockClear();
  authState = {
    user: { id: 'u1', email: 'a@b.com', role: 'admin' },
    status: 'authenticated',
  };
  apiGet.mockResolvedValue({ data: { settings: defaultSettings } });
  apiPatch.mockResolvedValue({ data: { updated: {} } });
});

describe('SettingsClient', () => {
  it('shows Forbidden for supervisor role', () => {
    authState = {
      user: { id: 'u1', email: 'a@b.com', role: 'supervisor' },
      status: 'authenticated',
    };
    render(<SettingsClient />);
    expect(screen.getByText('Forbidden')).toBeInTheDocument();
    expect(apiGet).not.toHaveBeenCalled();
  });

  it('shows Forbidden for rep role', () => {
    authState = {
      user: { id: 'u1', email: 'a@b.com', role: 'rep' },
      status: 'authenticated',
    };
    render(<SettingsClient />);
    expect(screen.getByText('Forbidden')).toBeInTheDocument();
  });

  it('renders TCPA, AMD, Retry, and Connection Status sections for admin', async () => {
    render(<SettingsClient />);
    expect(await screen.findByText('TCPA Defaults')).toBeInTheDocument();
    expect(screen.getByText('AMD Defaults')).toBeInTheDocument();
    expect(screen.getByText('Retry Defaults')).toBeInTheDocument();
    expect(screen.getByText('Connection Status')).toBeInTheDocument();
    expect(screen.getByTestId('vox-health-dot')).toBeInTheDocument();
    expect(screen.getByTestId('crm-health-dot')).toBeInTheDocument();
  });

  it('Save TCPA sends tcpa.* keys to PATCH', async () => {
    render(<SettingsClient />);
    const saveBtn = await screen.findByTestId('save-tcpa');
    // Wait for settings to load
    await waitFor(() =>
      expect(
        (screen.getByDisplayValue('08:00') as HTMLInputElement).value,
      ).toBe('08:00'),
    );
    fireEvent.click(saveBtn);
    await waitFor(() =>
      expect(apiPatch).toHaveBeenCalledWith('/api/settings', {
        'tcpa.window_start': '08:00',
        'tcpa.window_end': '21:00',
        'tcpa.default_timezone': 'UTC',
      }),
    );
  });

  it('Save AMD sends amd.* keys to PATCH', async () => {
    render(<SettingsClient />);
    const saveBtn = await screen.findByTestId('save-amd');
    await waitFor(() =>
      expect(
        (screen.getByDisplayValue('https://example.com/vm.mp3') as HTMLInputElement)
          .value,
      ).toBe('https://example.com/vm.mp3'),
    );
    fireEvent.click(saveBtn);
    await waitFor(() =>
      expect(apiPatch).toHaveBeenCalledWith('/api/settings', {
        'amd.enabled': 'true',
        'amd.vm_drop_url': 'https://example.com/vm.mp3',
      }),
    );
  });
});
