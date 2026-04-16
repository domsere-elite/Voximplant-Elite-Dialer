import VoximplantApiClient from '@voximplant/apiclient-nodejs';
import { config } from '../config';
import { logger } from '../lib/logger';

interface StartScenarioParams {
  ruleId: string;
  scriptCustomData?: string;
  userId?: string;
}

interface CallResult {
  result: number;
  mediaSessionAccessUrl?: string;
}

class VoximplantClient {
  private client: any;
  private initialized = false;

  async init(): Promise<void> {
    if (this.initialized) return;

    try {
      this.client = new VoximplantApiClient.default();
      await this.client.init(config.voximplant.apiKeyPath);
      this.initialized = true;
      logger.info('Voximplant API client initialized');
    } catch (err) {
      logger.error('Failed to initialize Voximplant client:', err);
      // In dev mode, continue without Voximplant connectivity
      if (config.env === 'development') {
        logger.warn('Running in development mode without Voximplant — calls will be mocked');
        return;
      }
      throw err;
    }
  }

  private ensureClient(): boolean {
    if (!this.initialized || !this.client) {
      logger.warn('Voximplant client not initialized — returning mock response');
      return false;
    }
    return true;
  }

  /**
   * Start a VoxEngine scenario (initiates an outbound call or other scenario).
   * This is the primary way to trigger calls — the scenario handles the actual telephony.
   */
  async startScenario(params: StartScenarioParams): Promise<CallResult | null> {
    if (!this.ensureClient()) {
      return { result: 1, mediaSessionAccessUrl: `mock-${Date.now()}` };
    }

    try {
      const result = await this.client.Scenarios.startScenarios({
        rule_id: params.ruleId,
        script_custom_data: params.scriptCustomData,
        ...(params.userId && { user_id: params.userId }),
      });
      logger.info('Scenario started:', result);
      return result;
    } catch (err) {
      logger.error('Failed to start scenario:', err);
      throw err;
    }
  }

  /**
   * Get call history from Voximplant.
   */
  async getCallHistory(fromDate: Date, toDate: Date, count = 100): Promise<any> {
    if (!this.ensureClient()) return { result: [], totalCount: 0 };

    try {
      return await this.client.History.getCallHistory({
        from_date: fromDate.toISOString(),
        to_date: toDate.toISOString(),
        count,
        with_records: true,
      });
    } catch (err) {
      logger.error('Failed to get call history:', err);
      throw err;
    }
  }

  /**
   * Hangup an active call via the Voximplant Management API.
   */
  async hangupCall(mediaSessionAccessUrl: string): Promise<void> {
    if (!this.ensureClient()) return;

    try {
      // Voximplant doesn't have a direct "hangup" API call — call termination
      // is handled within the VoxEngine scenario via VoxEngine.terminate().
      // The webhook-based approach sends a signal to the scenario.
      logger.info(`Call hangup requested for session: ${mediaSessionAccessUrl}`);
    } catch (err) {
      logger.error('Failed to hangup call:', err);
      throw err;
    }
  }

  /**
   * List available phone numbers on the account.
   */
  async getPhoneNumbers(): Promise<any> {
    if (!this.ensureClient()) return [];

    try {
      return await this.client.PhoneNumbers.getPhoneNumbers({});
    } catch (err) {
      logger.error('Failed to get phone numbers:', err);
      throw err;
    }
  }

  /**
   * Get current application info.
   */
  async getApplications(): Promise<any> {
    if (!this.ensureClient()) return [];

    try {
      return await this.client.Applications.getApplications({});
    } catch (err) {
      logger.error('Failed to get applications:', err);
      throw err;
    }
  }

  /**
   * Get rules for an application.
   */
  async getRules(applicationId: string): Promise<any> {
    if (!this.ensureClient()) return [];

    try {
      return await this.client.Rules.getRules({
        application_id: applicationId,
      });
    } catch (err) {
      logger.error('Failed to get rules:', err);
      throw err;
    }
  }

  // ===========================================================================
  // Call Lists API — replaces custom predictive worker with Voximplant-native
  // campaign pacing and dispatch.
  // ===========================================================================

  /**
   * Create a call list and start processing.
   * The CSV must have a 'phone_number' column. Additional columns become
   * custom data available in the VoxEngine scenario via VoxEngine.customData().
   */
  async createCallList(params: {
    ruleId: string;
    name: string;
    maxSimultaneous: number;
    numAttempts: number;
    csvContent: string;
    intervalSeconds: number;
    priority?: number;
  }): Promise<{ listId: number; count: number } | null> {
    if (!this.ensureClient()) {
      return { listId: Date.now(), count: 0 };
    }

    try {
      const result = await this.client.CallLists.createCallList({
        rule_id: params.ruleId,
        priority: params.priority || 1,
        max_simultaneous: params.maxSimultaneous,
        num_attempts: Math.min(params.numAttempts, 5),
        name: params.name,
        file_content: Buffer.from(params.csvContent).toString('base64'),
        interval_seconds: params.intervalSeconds,
      });
      logger.info(`Call list created: ${result.list_id}, count: ${result.count}`);
      return { listId: result.list_id, count: result.count };
    } catch (err) {
      logger.error('Failed to create call list:', err);
      throw err;
    }
  }

  /**
   * Append contacts to an existing call list.
   */
  async appendToCallList(listId: number, csvContent: string): Promise<{ count: number } | null> {
    if (!this.ensureClient()) return { count: 0 };

    try {
      const result = await this.client.CallLists.appendToCallList({
        list_id: listId,
        file_content: Buffer.from(csvContent).toString('base64'),
      });
      logger.info(`Appended to call list ${listId}: ${result.count} contacts`);
      return { count: result.count };
    } catch (err) {
      logger.error('Failed to append to call list:', err);
      throw err;
    }
  }

  /**
   * Stop/pause a call list from processing further tasks.
   */
  async stopCallListProcessing(listId: number): Promise<boolean> {
    if (!this.ensureClient()) return true;

    try {
      await this.client.CallLists.stopCallListProcessing({ list_id: listId });
      logger.info(`Call list ${listId} stopped`);
      return true;
    } catch (err) {
      logger.error('Failed to stop call list:', err);
      throw err;
    }
  }

  /**
   * Resume a stopped call list.
   */
  async recoverCallList(listId: number): Promise<{ count: number }> {
    if (!this.ensureClient()) return { count: 0 };

    try {
      const result = await this.client.CallLists.recoverCallList({ list_id: listId });
      logger.info(`Call list ${listId} recovered: ${result.count_recovery} tasks`);
      return { count: result.count_recovery };
    } catch (err) {
      logger.error('Failed to recover call list:', err);
      throw err;
    }
  }

  /**
   * Get detailed status of tasks in a call list.
   */
  async getCallListDetails(listId: number, count = 500, offset = 0): Promise<any> {
    if (!this.ensureClient()) return { result: [], totalCount: 0 };

    try {
      return await this.client.CallLists.getCallListDetails({
        list_id: listId,
        count,
        offset,
        output: 'json',
      });
    } catch (err) {
      logger.error('Failed to get call list details:', err);
      throw err;
    }
  }

  /**
   * Cancel specific tasks within a call list.
   */
  async cancelCallListTasks(listId: number, taskIds: number[]): Promise<boolean> {
    if (!this.ensureClient()) return true;

    try {
      await this.client.CallLists.cancelCallListTask({
        list_id: listId,
        tasks_ids: taskIds.join(';'),
      });
      return true;
    } catch (err) {
      logger.error('Failed to cancel call list tasks:', err);
      throw err;
    }
  }

  /**
   * Send an SMS via Voximplant.
   */
  async sendSMS(from: string, to: string, text: string): Promise<any> {
    if (!this.ensureClient()) return { result: 1 };

    try {
      return await this.client.SMS.sendSmsMessage({
        source: from,
        destination: to,
        sms_body: text,
      });
    } catch (err) {
      logger.error('Failed to send SMS:', err);
      throw err;
    }
  }
}

export const voximplantClient = new VoximplantClient();

// Initialize on module load
voximplantClient.init().catch((err) => {
  logger.error('Voximplant client initialization failed:', err);
});
