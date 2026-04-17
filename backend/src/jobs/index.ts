import type { Job } from 'bullmq';
import { createWorker, complianceQueue, didQueue, progressQueue } from './queue.js';
import { processSyncCallOutcome, syncCallOutcomeOptions } from './sync-call-outcome.js';
import { processBatchComplianceCheck, type BatchComplianceCheckJob } from './batch-compliance-check.js';
import { processComplianceRefresh } from './compliance-refresh.js';
import { processDidHealthCheck } from './did-health-check.js';
import { processSyncCampaignProgress } from './sync-campaign-progress.js';
import { logger } from '../lib/logger.js';

export async function registerAllWorkers(): Promise<void> {
  createWorker('sync-call-outcome', processSyncCallOutcome);
  createWorker('compliance', async (job: Job<BatchComplianceCheckJob>) => {
    if (job.name === 'batch-compliance-check') return processBatchComplianceCheck(job);
    if (job.name === 'compliance-refresh') return processComplianceRefresh(job as Job);
  });
  createWorker('did-health', processDidHealthCheck);
  createWorker('campaign-progress', processSyncCampaignProgress);

  await complianceQueue.add(
    'compliance-refresh',
    {},
    { repeat: { pattern: '*/5 * * * *' }, jobId: 'cron-compliance-refresh' },
  );
  await didQueue.add(
    'did-health-check',
    {},
    { repeat: { pattern: '0 * * * *' }, jobId: 'cron-did-health-check' },
  );
  await progressQueue.add(
    'sync-campaign-progress',
    {},
    { repeat: { every: 30_000 }, jobId: 'cron-campaign-progress' },
  );

  void syncCallOutcomeOptions;
  logger.info('BullMQ workers registered');
}
