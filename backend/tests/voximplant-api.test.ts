import { describe, it, expect, beforeEach, vi } from 'vitest';

const mockClient = {
  Users: {
    addUser: vi.fn().mockResolvedValue({ result: 1, userId: 42 }),
    getUsers: vi.fn(),
  },
  SmartQueue: {
    sqAddQueue: vi.fn().mockResolvedValue({ result: 1, sqQueueId: 99 }),
    sqGetQueueRealtimeMetrics: vi.fn().mockResolvedValue({
      result: [{ sqQueueId: 99, callsInQueue: 5, agentsAvailable: 3 }],
    }),
    sqStartSupervisorSession: vi.fn().mockResolvedValue({ result: 1 }),
  },
  CallLists: {
    createCallList: vi.fn().mockResolvedValue({ result: 1, listId: 77 }),
    appendToCallList: vi.fn().mockResolvedValue({ result: 1, count: 100 }),
    getCallListDetails: vi.fn().mockResolvedValue({ result: [] }),
    startNextCallTask: vi.fn().mockResolvedValue({ result: 1 }),
    stopCallListProcessing: vi.fn().mockResolvedValue({ result: 1 }),
  },
  PDS: {
    startPDSCampaign: vi.fn().mockResolvedValue({ result: 1 }),
    stopPDSCampaign: vi.fn().mockResolvedValue({ result: 1 }),
  },
  History: {
    getCallHistory: vi.fn().mockResolvedValue({ result: [] }),
  },
  Authentication: {
    addUserOneTimeLoginKey: vi.fn().mockResolvedValue({ key: 'one-time-xyz' }),
  },
  Scenarios: {
    startScenarios: vi.fn().mockResolvedValue({ callSessionHistoryId: 'vs-xyz' }),
  },
  onReady: Promise.resolve(),
};

vi.mock('@voximplant/apiclient-nodejs', () => ({
  default: {
    VoximplantApiClient: vi.fn().mockImplementation(() => mockClient),
  },
  VoximplantApiClient: vi.fn().mockImplementation(() => mockClient),
}));

import { VoximplantAPI } from '../src/services/voximplant-api.js';

describe('VoximplantAPI', () => {
  let api: VoximplantAPI;

  beforeEach(async () => {
    api = new VoximplantAPI();
    await api.init();
    vi.clearAllMocks();
  });

  it('createUser calls Users.addUser', async () => {
    mockClient.Users.addUser.mockResolvedValueOnce({ result: 1, userId: 42 });
    const out = await api.createUser('agent1', 'pw', 555);
    expect(mockClient.Users.addUser).toHaveBeenCalledWith(expect.objectContaining({
      userName: 'agent1',
      userDisplayName: 'agent1',
      userPassword: 'pw',
      applicationId: 555,
    }));
    expect(out.userId).toBe(42);
  });

  it('createOneTimeLoginKey returns key', async () => {
    const key = await api.createOneTimeLoginKey(42);
    expect(mockClient.Authentication.addUserOneTimeLoginKey).toHaveBeenCalledWith({ userId: 42 });
    expect(key).toBe('one-time-xyz');
  });

  it('createSmartQueue calls SmartQueue.sqAddQueue', async () => {
    const out = await api.createSmartQueue({ name: 'q', applicationId: 555, users: [42] });
    expect(mockClient.SmartQueue.sqAddQueue).toHaveBeenCalled();
    expect(out.queueId).toBe(99);
  });

  it('startPDSCampaign forwards params', async () => {
    await api.startPDSCampaign({
      queueId: 99, callListId: 77, mode: 'predictive', maxAbandonRate: 0.03, dialRatio: 1.2,
    });
    expect(mockClient.PDS.startPDSCampaign).toHaveBeenCalledWith(expect.objectContaining({
      sqQueueId: 99,
      listId: 77,
      maxAbandonRate: 0.03,
      dialRatio: 1.2,
    }));
  });

  it('stopPDSCampaign calls SDK', async () => {
    await api.stopPDSCampaign(99);
    expect(mockClient.PDS.stopPDSCampaign).toHaveBeenCalledWith({ sqQueueId: 99 });
  });

  it('createCallList passes fileContent', async () => {
    const out = await api.createCallList({
      ruleId: 1, priority: 1, maxSimultaneous: 5, numAttempts: 3, name: 'l',
      fileContent: Buffer.from('a;b;c'), intervalSeconds: 60,
    });
    expect(mockClient.CallLists.createCallList).toHaveBeenCalled();
    expect(out.listId).toBe(77);
  });

  it('appendToCallList forwards', async () => {
    const out = await api.appendToCallList(77, Buffer.from('x'));
    expect(mockClient.CallLists.appendToCallList).toHaveBeenCalledWith(expect.objectContaining({
      listId: 77,
    }));
    expect(out.count).toBe(100);
  });

  it('getCallListDetails forwards', async () => {
    await api.getCallListDetails(77, 0, 100);
    expect(mockClient.CallLists.getCallListDetails).toHaveBeenCalledWith(expect.objectContaining({
      listId: 77, offset: 0, count: 100,
    }));
  });

  it('getCallHistory forwards dates', async () => {
    const from = new Date('2026-04-01');
    const to = new Date('2026-04-16');
    await api.getCallHistory({ fromDate: from, toDate: to, applicationId: 555 });
    expect(mockClient.History.getCallHistory).toHaveBeenCalledWith(expect.objectContaining({
      fromDate: from, toDate: to, applicationId: 555,
    }));
  });

  it('getSmartQueueRealtimeMetrics returns metrics', async () => {
    const out = await api.getSmartQueueRealtimeMetrics(99);
    expect(out.callsInQueue).toBe(5);
  });

  it('startSupervisorSession forwards mode', async () => {
    await api.startSupervisorSession({
      callSessionId: 'cs-1', supervisorUsername: 'sup', mode: 'whisper',
    });
    expect(mockClient.SmartQueue.sqStartSupervisorSession).toHaveBeenCalledWith(expect.objectContaining({
      callSessionId: 'cs-1', supervisorUserName: 'sup', mode: 'whisper',
    }));
  });

  it('startScenarios calls Scenarios.startScenarios', async () => {
    const out = await api.startScenarios({ ruleId: 1, customData: '{"x":1}' });
    expect(mockClient.Scenarios.startScenarios).toHaveBeenCalledWith(expect.objectContaining({
      ruleId: 1,
      customData: '{"x":1}',
    }));
    expect(out.callSessionHistoryId).toBe('vs-xyz');
  });
});
