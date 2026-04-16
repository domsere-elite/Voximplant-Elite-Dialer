import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { apiGet } = vi.hoisted(() => ({ apiGet: vi.fn() }));

vi.mock('@/lib/api', () => ({
  api: {
    get: apiGet,
    post: vi.fn(),
    patch: vi.fn(),
    interceptors: { request: { use: vi.fn() }, response: { use: vi.fn() } },
  },
}));

import {
  CampaignForm,
  CampaignFormValues,
  validate,
} from '@/components/campaign/CampaignForm';

const base: CampaignFormValues = {
  name: 'X',
  dialMode: 'MANUAL',
  crmCampaignId: '',
  didGroupId: 'g1',
  scheduleStart: '',
  scheduleEnd: '',
  dialingHoursStart: '09:00',
  dialingHoursEnd: '20:00',
  timezone: 'America/Chicago',
  maxConcurrentCalls: 10,
  maxAbandonRate: 0.03,
  dialRatio: 1.5,
  maxAttempts: 3,
  retryDelayMinutes: 60,
  callerIdStrategy: 'PROXIMITY',
  fixedCallerId: '',
  amdEnabled: false,
  voicemailDropUrl: '',
  autoAnswer: false,
};

beforeEach(() => {
  vi.clearAllMocks();
  apiGet.mockResolvedValue({ data: [{ id: 'g1', name: 'Group A' }] });
});

describe('CampaignForm.validate', () => {
  it('requires name', () => {
    expect(validate({ ...base, name: '' }).name).toBeDefined();
  });

  it('requires DID group', () => {
    expect(validate({ ...base, didGroupId: '' }).didGroupId).toBeDefined();
  });

  it('rejects schedule end before start', () => {
    const e = validate({
      ...base,
      scheduleStart: '2026-05-01T10:00',
      scheduleEnd: '2026-05-01T09:00',
    });
    expect(e.scheduleEnd).toBeDefined();
  });

  it('rejects dialing hours end before start', () => {
    const e = validate({
      ...base,
      dialingHoursStart: '20:00',
      dialingHoursEnd: '09:00',
    });
    expect(e.dialingHoursEnd).toBeDefined();
  });

  it('requires fixed caller ID when strategy=FIXED', () => {
    const e = validate({ ...base, callerIdStrategy: 'FIXED' });
    expect(e.fixedCallerId).toBeDefined();
  });

  it('rejects invalid E.164', () => {
    const e = validate({
      ...base,
      callerIdStrategy: 'FIXED',
      fixedCallerId: '555-1234',
    });
    expect(e.fixedCallerId).toMatch(/E\.164/);
  });

  it('accepts valid E.164', () => {
    const e = validate({
      ...base,
      callerIdStrategy: 'FIXED',
      fixedCallerId: '+15551234567',
    });
    expect(e.fixedCallerId).toBeUndefined();
  });

  it('rejects abandon rate > 1', () => {
    expect(validate({ ...base, maxAbandonRate: 1.5 }).maxAbandonRate).toBeDefined();
  });

  it('rejects abandon rate < 0', () => {
    expect(validate({ ...base, maxAbandonRate: -0.1 }).maxAbandonRate).toBeDefined();
  });

  it('rejects dialRatio > 5', () => {
    expect(validate({ ...base, dialRatio: 5.5 }).dialRatio).toBeDefined();
  });

  it('accepts dialRatio = 5', () => {
    expect(validate({ ...base, dialRatio: 5 }).dialRatio).toBeUndefined();
  });

  it('rejects maxAttempts > 20', () => {
    expect(validate({ ...base, maxAttempts: 21 }).maxAttempts).toBeDefined();
  });

  it('accepts maxAttempts = 20', () => {
    expect(validate({ ...base, maxAttempts: 20 }).maxAttempts).toBeUndefined();
  });

  it('rejects retryDelayMinutes < 1', () => {
    expect(
      validate({ ...base, retryDelayMinutes: 0 }).retryDelayMinutes,
    ).toBeDefined();
  });

  it('rejects retryDelayMinutes > 10080', () => {
    expect(
      validate({ ...base, retryDelayMinutes: 10081 }).retryDelayMinutes,
    ).toBeDefined();
  });

  it('rejects maxConcurrentCalls > 500', () => {
    expect(
      validate({ ...base, maxConcurrentCalls: 501 }).maxConcurrentCalls,
    ).toBeDefined();
  });
});

describe('CampaignForm render', () => {
  it('submits valid form', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(<CampaignForm onSubmit={onSubmit} />);
    await screen.findByText('Group A');
    fireEvent.change(screen.getByRole('textbox', { name: /^Name$/i }), {
      target: { value: 'Test Campaign' },
    });
    fireEvent.change(screen.getByRole('combobox', { name: /DID Group/i }), {
      target: { value: 'g1' },
    });
    fireEvent.click(screen.getByRole('button', { name: /save/i }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalled());
    const submitted = onSubmit.mock.calls[0][0] as CampaignFormValues;
    expect(submitted.name).toBe('Test Campaign');
    expect(submitted.didGroupId).toBe('g1');
    expect(submitted.dialMode).toBe('MANUAL');
    expect(submitted.callerIdStrategy).toBe('PROXIMITY');
  });

  it('reveals fixed caller id input when strategy=FIXED', async () => {
    render(<CampaignForm onSubmit={vi.fn()} />);
    await screen.findByText('Group A');
    fireEvent.click(screen.getByLabelText('Fixed'));
    expect(await screen.findByLabelText(/Fixed Caller ID/i)).toBeInTheDocument();
  });

  it('shows validation errors when name missing', async () => {
    const onSubmit = vi.fn();
    render(<CampaignForm onSubmit={onSubmit} />);
    await screen.findByText('Group A');
    // DID group default is empty, so select g1 first to isolate the name check
    fireEvent.change(screen.getByRole('combobox', { name: /DID Group/i }), {
      target: { value: 'g1' },
    });
    fireEvent.click(screen.getByRole('button', { name: /save/i }));
    expect(await screen.findByText(/Name is required/)).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('auto-toggles autoAnswer when dial mode changes to PREDICTIVE', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(<CampaignForm onSubmit={onSubmit} />);
    await screen.findByText('Group A');
    fireEvent.change(screen.getByRole('textbox', { name: /^Name$/i }), {
      target: { value: 'Auto Test' },
    });
    fireEvent.change(screen.getByRole('combobox', { name: /DID Group/i }), {
      target: { value: 'g1' },
    });
    fireEvent.change(screen.getByRole('combobox', { name: /Dial Mode/i }), {
      target: { value: 'PREDICTIVE' },
    });
    fireEvent.click(screen.getByRole('button', { name: /save/i }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalled());
    const submitted = onSubmit.mock.calls[0][0] as CampaignFormValues;
    expect(submitted.dialMode).toBe('PREDICTIVE');
    expect(submitted.autoAnswer).toBe(true);
  });

  it('renders DID groups loaded from API', async () => {
    render(<CampaignForm onSubmit={vi.fn()} />);
    expect(await screen.findByText('Group A')).toBeInTheDocument();
  });
});
