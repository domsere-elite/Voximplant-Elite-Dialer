import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

type TestAuthState = {
  user: { id: string; email: string; role: 'rep' | 'supervisor' | 'admin' } | null;
};
let authState: TestAuthState = {
  user: { id: 'u1', email: 'a@b.com', role: 'admin' },
};
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => authState }));

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

import PhoneNumbersClient from '@/app/dashboard/phone-numbers/PhoneNumbersClient';

const fixtureNumbers = [
  {
    id: 'n1',
    number: '+15551234567',
    voximplantNumberId: 42,
    didGroupId: null,
    areaCode: '555',
    state: 'TX',
    isActive: true,
    healthScore: 90,
    dailyCallCount: 10,
    dailyCallLimit: 100,
    lastUsedAt: null,
    cooldownUntil: null,
  },
];

const fixtureGroups = [
  { id: 'g1', name: 'Texas Group', numbers: [] },
];

beforeEach(() => {
  apiGet.mockReset();
  apiPost.mockReset();
  apiPatch.mockReset();
  apiDelete.mockReset();
  authState = { user: { id: 'u1', email: 'a@b.com', role: 'admin' } };
  apiGet.mockImplementation((url: string) => {
    if (url.includes('/api/phone-numbers')) return Promise.resolve({ data: fixtureNumbers });
    if (url.includes('/api/did-groups')) return Promise.resolve({ data: fixtureGroups });
    return Promise.resolve({ data: [] });
  });
});

describe('PhoneNumbersClient', () => {
  it('shows Forbidden for supervisor role', () => {
    authState = { user: { id: 'u1', email: 'a@b.com', role: 'supervisor' } };
    render(<PhoneNumbersClient />);
    expect(screen.getByText('Forbidden')).toBeInTheDocument();
    expect(apiGet).not.toHaveBeenCalled();
  });

  it('shows Forbidden for rep role', () => {
    authState = { user: { id: 'u1', email: 'a@b.com', role: 'rep' } };
    render(<PhoneNumbersClient />);
    expect(screen.getByText('Forbidden')).toBeInTheDocument();
  });

  it('renders numbers table for admin', async () => {
    render(<PhoneNumbersClient />);
    expect(await screen.findByText('+15551234567')).toBeInTheDocument();
    expect(screen.getByText('TX')).toBeInTheDocument();
    expect(screen.getByTestId('add-number-btn')).toBeInTheDocument();
  });

  it('switches to DID Groups tab', async () => {
    render(<PhoneNumbersClient />);
    await screen.findByText('+15551234567');
    fireEvent.click(screen.getByRole('tab', { name: 'DID Groups' }));
    await waitFor(() =>
      expect(screen.getByText('Texas Group')).toBeInTheDocument(),
    );
    // Add Number button hidden on groups tab
    expect(screen.queryByTestId('add-number-btn')).not.toBeInTheDocument();
  });

  it('toggles active via PATCH with camelCase body', async () => {
    apiPatch.mockResolvedValue({ data: {} });
    render(<PhoneNumbersClient />);
    const checkbox = await screen.findByLabelText(/Toggle active for \+15551234567/i);
    fireEvent.click(checkbox);
    await waitFor(() =>
      expect(apiPatch).toHaveBeenCalledWith('/api/phone-numbers/n1', { isActive: false }),
    );
  });

  it('shows error banner when load fails', async () => {
    apiGet.mockReset();
    apiGet.mockRejectedValue(new Error('network down'));
    render(<PhoneNumbersClient />);
    expect(await screen.findByText(/network down/i)).toBeInTheDocument();
  });
});
