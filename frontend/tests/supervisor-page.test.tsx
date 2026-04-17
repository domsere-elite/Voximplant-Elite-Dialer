import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { LiveCallCard, LiveCall } from '@/components/supervisor/LiveCallCard';

const baseCall: LiveCall = {
  id: 'call-1',
  agent_id: 'a-1',
  agent_name: 'Alice',
  consumer_phone: '+15551234567',
  campaign_id: 'c-1',
  campaign_name: 'Test Campaign',
  status: 'connected',
  started_at: new Date(Date.now() - 65000).toISOString(),
};

describe('LiveCallCard', () => {
  it('renders masked phone, agent name, campaign', () => {
    render(
      <LiveCallCard
        call={baseCall}
        onListen={vi.fn()}
        onWhisper={vi.fn()}
        onBarge={vi.fn()}
      />
    );
    expect(screen.getByText('Alice')).toBeInTheDocument();
    expect(screen.getByText('Test Campaign')).toBeInTheDocument();
    expect(screen.getByText(/XXX\) XXX-4567/)).toBeInTheDocument();
  });

  it('invokes handlers', () => {
    const onListen = vi.fn();
    const onWhisper = vi.fn();
    const onBarge = vi.fn();
    render(
      <LiveCallCard
        call={baseCall}
        onListen={onListen}
        onWhisper={onWhisper}
        onBarge={onBarge}
      />
    );
    fireEvent.click(screen.getByTestId('listen-call-1'));
    fireEvent.click(screen.getByTestId('whisper-call-1'));
    fireEvent.click(screen.getByTestId('barge-call-1'));
    expect(onListen).toHaveBeenCalledWith('call-1');
    expect(onWhisper).toHaveBeenCalledWith('call-1');
    expect(onBarge).toHaveBeenCalledWith('call-1');
  });

  it('disables buttons while action in flight', () => {
    render(
      <LiveCallCard
        call={baseCall}
        onListen={vi.fn()}
        onWhisper={vi.fn()}
        onBarge={vi.fn()}
        actionInFlight
      />
    );
    expect(screen.getByTestId('listen-call-1')).toBeDisabled();
    expect(screen.getByTestId('whisper-call-1')).toBeDisabled();
    expect(screen.getByTestId('barge-call-1')).toBeDisabled();
  });
});
