import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { exportToCSV } from '@/lib/csv-export';
import { DateRangePicker } from '@/components/reports/DateRangePicker';

type TestAuthState = {
  user: { id: string; email: string; role: 'rep' | 'supervisor' | 'admin' } | null;
  status: 'idle' | 'loading' | 'authenticated' | 'error';
};
let authState: TestAuthState = {
  user: { id: 'u1', email: 'a@b.com', role: 'supervisor' },
  status: 'authenticated',
};
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => authState }));

const { apiGet } = vi.hoisted(() => ({ apiGet: vi.fn() }));
vi.mock('@/lib/api', () => ({
  api: {
    get: apiGet,
    post: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
    interceptors: { request: { use: vi.fn() }, response: { use: vi.fn() } },
  },
}));

import ReportsClient from '@/app/dashboard/reports/ReportsClient';

const campaignsFixture = [
  {
    id: 'c1',
    name: 'Spring Outreach',
    total_dialed: 100,
    total_connected: 40,
    connect_rate: 0.4,
    amd_rate: 0.1,
    avg_duration: 75,
    abandon_rate: 0,
    outcomes: { sold: 10 },
  },
];

beforeEach(() => {
  apiGet.mockReset();
  authState = {
    user: { id: 'u1', email: 'a@b.com', role: 'supervisor' },
    status: 'authenticated',
  };
  apiGet.mockImplementation((url: string) => {
    if (url.includes('/api/reports/campaigns'))
      return Promise.resolve({ data: { campaigns: campaignsFixture } });
    if (url.includes('/api/reports/agents'))
      return Promise.resolve({ data: { agents: [] } });
    if (url.includes('/api/reports/did-health'))
      return Promise.resolve({ data: { numbers: [] } });
    return Promise.resolve({ data: {} });
  });
});

describe('csv-export', () => {
  it('escapes commas, quotes, and newlines', async () => {
    // Intercept the Blob passed to createObjectURL and inspect its parts.
    let captured = '';
    const originalCreateObjectURL = URL.createObjectURL;
    const originalRevokeObjectURL = URL.revokeObjectURL;
    const OriginalBlob = global.Blob;
    class CapturingBlob {
      parts: string;
      type: string;
      constructor(parts: BlobPart[], opts?: { type?: string }) {
        this.parts = parts.map((p) => String(p)).join('');
        this.type = opts?.type ?? '';
        captured = this.parts;
      }
    }
    // @ts-expect-error swap Blob for a capturing stub
    global.Blob = CapturingBlob;
    URL.createObjectURL = (() => 'blob:mock') as typeof URL.createObjectURL;
    URL.revokeObjectURL = vi.fn() as typeof URL.revokeObjectURL;

    const click = vi.fn();
    const origCreateElement = document.createElement.bind(document);
    const spy = vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
      const el = origCreateElement(tag);
      if (tag === 'a') (el as HTMLAnchorElement).click = click;
      return el;
    });

    exportToCSV('test.csv', [
      { a: 'hello, world', b: 'she said "hi"', c: 'line1\nline2' },
      { a: 'plain', b: null, c: undefined },
    ]);

    // restore
    global.Blob = OriginalBlob;
    URL.createObjectURL = originalCreateObjectURL;
    URL.revokeObjectURL = originalRevokeObjectURL;
    spy.mockRestore();

    expect(click).toHaveBeenCalled();
    expect(captured).toContain('"hello, world"');
    expect(captured).toContain('"she said ""hi"""');
    expect(captured).toContain('"line1\nline2"');
    // null/undefined -> empty strings
    expect(captured).toContain('plain,,');
  });

  it('returns early on empty rows (no download triggered)', () => {
    const click = vi.fn();
    const origCreateElement = document.createElement.bind(document);
    const spy = vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
      const el = origCreateElement(tag);
      if (tag === 'a') (el as HTMLAnchorElement).click = click;
      return el;
    });
    exportToCSV('empty.csv', []);
    expect(click).not.toHaveBeenCalled();
    spy.mockRestore();
  });
});

describe('DateRangePicker', () => {
  it('emits onChange with new dateFrom', () => {
    const onChange = vi.fn();
    render(
      <DateRangePicker
        value={{ dateFrom: '2026-04-01', dateTo: '2026-04-16' }}
        onChange={onChange}
      />,
    );
    const from = screen.getByTestId('date-from') as HTMLInputElement;
    fireEvent.change(from, { target: { value: '2026-03-01' } });
    expect(onChange).toHaveBeenCalledWith({ dateFrom: '2026-03-01', dateTo: '2026-04-16' });
  });

  it('emits onChange with new dateTo', () => {
    const onChange = vi.fn();
    render(
      <DateRangePicker
        value={{ dateFrom: '2026-04-01', dateTo: '2026-04-16' }}
        onChange={onChange}
      />,
    );
    const to = screen.getByTestId('date-to') as HTMLInputElement;
    fireEvent.change(to, { target: { value: '2026-04-17' } });
    expect(onChange).toHaveBeenCalledWith({ dateFrom: '2026-04-01', dateTo: '2026-04-17' });
  });
});

describe('ReportsClient', () => {
  it('shows Forbidden for rep role', () => {
    authState = {
      user: { id: 'u1', email: 'a@b.com', role: 'rep' },
      status: 'authenticated',
    };
    render(<ReportsClient />);
    expect(screen.getByText('Forbidden')).toBeInTheDocument();
    expect(apiGet).not.toHaveBeenCalled();
  });

  it('renders campaign report table for supervisor', async () => {
    render(<ReportsClient />);
    expect(await screen.findByTestId('campaign-report-table')).toBeInTheDocument();
    expect(screen.getByText('Spring Outreach')).toBeInTheDocument();
    expect(screen.getByText('40.0%')).toBeInTheDocument(); // connect_rate
    // Verify all three endpoints were called
    await waitFor(() => expect(apiGet).toHaveBeenCalledTimes(3));
    const urls = apiGet.mock.calls.map((c) => c[0]);
    expect(urls).toContain('/api/reports/campaigns');
    expect(urls).toContain('/api/reports/agents');
    expect(urls).toContain('/api/reports/did-health');
  });

  it('switches to Agents tab', async () => {
    render(<ReportsClient />);
    await screen.findByTestId('campaign-report-table');
    fireEvent.click(screen.getByRole('tab', { name: 'Agents' }));
    await waitFor(() =>
      expect(screen.getByTestId('agent-report-table')).toBeInTheDocument(),
    );
  });

  it('shows error banner when load fails', async () => {
    apiGet.mockReset();
    apiGet.mockRejectedValue(new Error('network down'));
    render(<ReportsClient />);
    expect(await screen.findByText(/network down/i)).toBeInTheDocument();
  });
});
