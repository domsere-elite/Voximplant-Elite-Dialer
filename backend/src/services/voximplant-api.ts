import VoximplantApiClientPkg from '@voximplant/apiclient-nodejs';
import { config } from '../config.js';
import { logger } from '../lib/logger.js';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const VoximplantApiClient =
  (VoximplantApiClientPkg as any).VoximplantApiClient ??
  (VoximplantApiClientPkg as any).default ??
  (VoximplantApiClientPkg as any);

export interface CallListDetail {
  listId: number;
  customData?: string;
  status?: string;
  [key: string]: unknown;
}

export interface CallSession {
  callSessionHistoryId: number;
  startDate?: string;
  duration?: number;
  [key: string]: unknown;
}

export interface QueueMetrics {
  sqQueueId: number;
  callsInQueue: number;
  agentsAvailable: number;
  [key: string]: unknown;
}

export class VoximplantAPI {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private client: any;
  private initialized = false;

  async init(): Promise<void> {
    if (this.initialized) return;
    process.env.VOXIMPLANT_CREDENTIALS = config.voximplant.apiKeyPath;
    this.client = new VoximplantApiClient(config.voximplant.apiKeyPath);
    // apiclient-nodejs resolves an `onReady` promise when ready
    if (this.client.onReady && typeof this.client.onReady.then === 'function') {
      await this.client.onReady;
    }
    this.initialized = true;
    logger.info('voximplant api client initialized');
  }

  async createUser(name: string, password: string, applicationId: number): Promise<{ userId: number; username: string }> {
    const res = await this.client.Users.addUser({
      userName: name,
      userDisplayName: name,
      userPassword: password,
      applicationId,
    });
    return { userId: res.userId, username: name };
  }

  async createOneTimeLoginKey(userId: number): Promise<string> {
    const res = await this.client.Authentication.addUserOneTimeLoginKey({ userId });
    return res.key;
  }

  async createSmartQueue(params: { name: string; applicationId: number; users: number[] }): Promise<{ queueId: number }> {
    const res = await this.client.SmartQueue.sqAddQueue({
      applicationId: params.applicationId,
      sqQueueName: params.name,
      callAgentSelection: 'MOST_QUALIFIED',
      callTaskSelection: 'MAX_WAITING_TIME',
      userList: params.users.join(','),
    });
    return { queueId: res.sqQueueId };
  }

  async startPDSCampaign(params: {
    queueId: number;
    callListId: number;
    mode: 'progressive' | 'predictive';
    maxAbandonRate: number;
    dialRatio: number;
  }): Promise<void> {
    await this.client.PDS.startPDSCampaign({
      sqQueueId: params.queueId,
      listId: params.callListId,
      mode: params.mode,
      maxAbandonRate: params.maxAbandonRate,
      dialRatio: params.dialRatio,
    });
  }

  async stopPDSCampaign(queueId: number): Promise<void> {
    await this.client.PDS.stopPDSCampaign({ sqQueueId: queueId });
  }

  async createCallList(params: {
    ruleId: number;
    priority: number;
    maxSimultaneous: number;
    numAttempts: number;
    name: string;
    fileContent: Buffer;
    intervalSeconds: number;
    encoding?: string;
    delimiter?: string;
    startAt?: number;
  }): Promise<{ listId: number }> {
    const res = await this.client.CallLists.createCallList({
      ruleId: params.ruleId,
      priority: params.priority,
      maxSimultaneous: params.maxSimultaneous,
      numAttempts: params.numAttempts,
      name: params.name,
      fileContent: params.fileContent,
      intervalSeconds: params.intervalSeconds,
      encoding: params.encoding ?? 'utf-8',
      delimiter: params.delimiter ?? ';',
      startAt: params.startAt,
    });
    return { listId: res.listId };
  }

  async appendToCallList(listId: number, fileContent: Buffer): Promise<{ count: number }> {
    const res = await this.client.CallLists.appendToCallList({
      listId,
      fileContent,
      encoding: 'utf-8',
      delimiter: ';',
    });
    return { count: res.count ?? 0 };
  }

  async getCallListDetails(listId: number, offset = 0, count = 100): Promise<CallListDetail[]> {
    const res = await this.client.CallLists.getCallListDetails({ listId, offset, count });
    return res.result ?? [];
  }

  async getCallHistory(params: {
    fromDate: Date;
    toDate: Date;
    applicationId: number;
    withCalls?: boolean;
    withRecords?: boolean;
  }): Promise<CallSession[]> {
    const res = await this.client.History.getCallHistory({
      fromDate: params.fromDate,
      toDate: params.toDate,
      applicationId: params.applicationId,
      withCalls: params.withCalls ?? true,
      withRecords: params.withRecords ?? true,
    });
    return res.result ?? [];
  }

  async getSmartQueueRealtimeMetrics(queueId: number): Promise<QueueMetrics> {
    const res = await this.client.SmartQueue.sqGetQueueRealtimeMetrics({ sqQueueId: queueId });
    const row = (res.result ?? [])[0] ?? { sqQueueId: queueId, callsInQueue: 0, agentsAvailable: 0 };
    return row as QueueMetrics;
  }

  async startSupervisorSession(params: {
    callSessionId: string;
    supervisorUsername: string;
    mode: 'listen' | 'whisper' | 'barge';
  }): Promise<void> {
    await this.client.SmartQueue.sqStartSupervisorSession({
      callSessionId: params.callSessionId,
      supervisorUserName: params.supervisorUsername,
      mode: params.mode,
    });
  }

  async startScenarios(params: {
    ruleId: number;
    userId?: number;
    customData?: string;
    script?: string;
  }): Promise<{ callSessionHistoryId: string }> {
    const res = await this.client.Scenarios.startScenarios({
      ruleId: params.ruleId,
      userId: params.userId,
      customData: params.customData,
      script: params.script,
    });
    return { callSessionHistoryId: String(res.callSessionHistoryId ?? res.callSessionsIds ?? '') };
  }
}

export const voximplantAPI = new VoximplantAPI();
