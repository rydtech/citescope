import { Worker } from 'bullmq';
import { getRedisConnection, QUEUE_NAMES } from './queue.js';
import { handleCrawlJob } from './handlers/crawl.js';
import { handleRulesJob } from './handlers/rules.js';
import { handleReportJob } from './handlers/report.js';
import { processOutbox } from './outbox.js';
import { logger } from './logger.js';
import { updateAuditRunState } from '@citescope/database';

logger.info('CiteScope worker starting');

// Crawl worker
const crawlWorker = new Worker(
  QUEUE_NAMES.CRAWL,
  async (job) => {
    await handleCrawlJob(job);
  },
  {
    connection: getRedisConnection(),
    concurrency: 2,
  }
);

// Rules worker
const rulesWorker = new Worker(
  QUEUE_NAMES.RULES,
  async (job) => {
    await handleRulesJob(job);
  },
  {
    connection: getRedisConnection(),
    concurrency: 4,
  }
);

// Report worker
const reportWorker = new Worker(
  QUEUE_NAMES.REPORT,
  async (job) => {
    await handleReportJob(job);
  },
  {
    connection: getRedisConnection(),
    concurrency: 4,
  }
);

// Outbox poller — every 5 seconds
setInterval(() => {
  processOutbox().catch(err => logger.error('Outbox processing error', { message: String(err) }));
}, 5000);

// Graceful shutdown
async function shutdown(): Promise<void> {
  logger.info('Worker shutting down...');
  await Promise.all([
    crawlWorker.close(),
    rulesWorker.close(),
    reportWorker.close(),
  ]);
  process.exit(0);
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

// Error handlers
for (const worker of [crawlWorker, rulesWorker, reportWorker]) {
  worker.on('failed', (job, err) => {
    logger.error('Job failed', {
      job_id: job?.id,
      audit_run_id: job?.data?.audit_run_id,
      message: err.message,
      attempts_made: job?.attemptsMade,
      max_attempts: job?.opts?.attempts,
    });
    // When retries are exhausted, mark the audit run as failed
    const auditRunId = job?.data?.audit_run_id as string | undefined;
    const attemptsLeft = (job?.opts?.attempts ?? 1) - (job?.attemptsMade ?? 0);
    if (auditRunId && attemptsLeft <= 0) {
      updateAuditRunState(auditRunId, 'failed', { failure_reason: err.message }).catch(updateErr => {
        logger.error('Failed to mark audit as failed', { audit_run_id: auditRunId, message: String(updateErr) });
      });
    }
  });
  worker.on('error', (err) => {
    logger.error('Worker error', { message: err.message });
  });
}

logger.info('CiteScope worker ready', {
  queues: Object.values(QUEUE_NAMES),
});
