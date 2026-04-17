import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import MockAdapter from 'axios-mock-adapter';
import { CRMClient } from '../src/lib/crm-client.js';

describe('CRMClient', () => {
  let client: CRMClient;
  let mock: MockAdapter;

  beforeEach(() => {
    client = new CRMClient();
    // Access private http via bracket notation — type-safe enough for test
    mock = new MockAdapter((client as unknown as { http: import('axios').AxiosInstance }).http, { delayResponse: 0 });
  });

  afterEach(() => {
    mock.reset();
    mock.restore();
  });

  it('sends X-Dialer-Key header', async () => {
    mock.onGet('/api/voice/dnc').reply((reqConfig) => {
      expect(reqConfig.headers?.['X-Dialer-Key']).toBe(process.env.CRM_API_KEY || 'test');
      return [200, { blocked: false }];
    });
    const result = await client.checkDNC('+15551234567');
    expect(result.blocked).toBe(false);
  });

  it('checkDNC GET /api/voice/dnc?phone=', async () => {
    mock.onGet('/api/voice/dnc', { params: { phone: '+15551234567' } })
      .reply(200, { blocked: true, reason: 'consumer opt-out' });
    const result = await client.checkDNC('+15551234567');
    expect(result).toEqual({ blocked: true, reason: 'consumer opt-out' });
  });

  it('getAccount GET /api/work/:id', async () => {
    mock.onGet('/api/work/acc-1').reply(200, { id: 'acc-1', name: 'Jane' });
    const result = await client.getAccount('acc-1');
    expect(result).toEqual({ id: 'acc-1', name: 'Jane' });
  });

  it('getTCPACompliance GET /api/work/:id/tcpa-compliance', async () => {
    mock.onGet('/api/work/acc-1/tcpa-compliance')
      .reply(200, { count: 3, lastCallAt: '2026-04-15T10:00:00Z' });
    const result = await client.getTCPACompliance('acc-1');
    expect(result.count).toBe(3);
    expect(result.lastCallAt).toBeInstanceOf(Date);
  });

  it('getTCPACompliance handles null lastCallAt', async () => {
    mock.onGet('/api/work/acc-1/tcpa-compliance').reply(200, { count: 0, lastCallAt: null });
    const result = await client.getTCPACompliance('acc-1');
    expect(result.lastCallAt).toBeNull();
  });

  it('logCall POST /api/work/:id/call', async () => {
    mock.onPost('/api/work/acc-1/call').reply(200, { success: true });
    const result = await client.logCall('acc-1', {
      duration: 120, outcome: 'answered', agentId: 'a1', voximplantCallId: 'vx-1',
    });
    expect(result.success).toBe(true);
  });

  it('updateStatus PATCH /api/work/:id/status', async () => {
    mock.onPatch('/api/work/acc-1/status').reply(200, {});
    await client.updateStatus('acc-1', 'pending_payment', 'user-1');
    expect(mock.history.patch[0].url).toBe('/api/work/acc-1/status');
    const body = JSON.parse(mock.history.patch[0].data);
    expect(body).toEqual({ status: 'pending_payment', userId: 'user-1' });
  });

  it('logCompliance POST /api/voice/tools/log-compliance', async () => {
    mock.onPost('/api/voice/tools/log-compliance').reply(200, {});
    await client.logCompliance({ accountId: 'acc-1', phone: '+15551234567', check: 'dnc', result: 'block', reason: 'dnc' });
    expect(mock.history.post[0].url).toBe('/api/voice/tools/log-compliance');
  });

  it('getCampaignAccounts GET /api/voice/campaigns/:id/accounts', async () => {
    mock.onGet('/api/voice/campaigns/c-1/accounts').reply(200, [{ id: 'acc-1', phone: '+15551234567' }]);
    const result = await client.getCampaignAccounts('c-1');
    expect(result).toHaveLength(1);
  });

  it('searchAccounts GET /api/work/search', async () => {
    mock.onGet('/api/work/search', { params: { q: 'jane' } }).reply(200, [{ id: 'acc-1' }]);
    const result = await client.searchAccounts('jane');
    expect(result).toHaveLength(1);
  });

  it('verifyLogin POST /api/auth/dialer-verify', async () => {
    mock.onPost('/api/auth/dialer-verify').reply(200, { id: 'u-1', email: 'x@y.com', role: 'rep' });
    const user = await client.verifyLogin('x@y.com', 'pw');
    expect(user?.id).toBe('u-1');
  });

  it('verifyLogin returns null on 401', async () => {
    mock.onPost('/api/auth/dialer-verify').reply(401);
    const user = await client.verifyLogin('x@y.com', 'bad');
    expect(user).toBeNull();
  });

  it('verifyLogin returns null on 403', async () => {
    mock.onPost('/api/auth/dialer-verify').reply(403);
    const user = await client.verifyLogin('x@y.com', 'bad');
    expect(user).toBeNull();
  });

  it('retries on 5xx', async () => {
    let attempts = 0;
    mock.onGet('/api/work/acc-1').reply(() => {
      attempts += 1;
      if (attempts < 3) return [500, { error: 'boom' }];
      return [200, { id: 'acc-1' }];
    });
    const result = await client.getAccount('acc-1');
    expect(attempts).toBe(3);
    expect(result.id).toBe('acc-1');
  }, 15000);
});
