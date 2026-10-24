import { getDb } from '@citescope/database';
import { crawlQueue, rulesQueue, reportQueue, QUEUE_NAMES } from './queue.js';
import { logger } from './logger.js';

/**
 * Polls the outbox_events table and publishes unpublished events to BullMQ.
 * This ensures DB commit and queue delivery cannot silently diverge.
 */
export async function processOutbox(): Promise<void> {
  const sql = getDb();

  // Select without FOR UPDATE outside transaction first to check quickly
  const events = await sql`
    SELECT * FROM outbox_events
    WHERE published = FALSE
    ORDER BY created_at ASC
    LIMIT 50
  `;

  for (const event of events) {
    try {
      let queue;
      if (event.event_type === 'audit.start') queue = crawlQueue;
      else if (event.event_type === 'crawl.complete') queue = rulesQueue;
      else if (event.event_type === 'rules.complete') queue = reportQueue;
      else {
        logger.warn('Unknown outbox event type', { audit_run_id: String(event.aggregate_id), job_id: String(event.id) });
        continue;
      }

      await queue.add(event.event_type as string, event.payload, {
        jobId: String(event.id).replace(/-/g, ''),
      });

      await sql`
        UPDATE outbox_events SET published = TRUE, published_at = NOW()
        WHERE id = ${event.id}
      `;
      logger.info('Outbox event published', { job_id: String(event.id) });
    } catch (err) {
      logger.error('Failed to publish outbox event', { job_id: String(event.id), message: String(err) });
    }
  }
}

export async function enqueueAuditStart(payload: {
  audit_run_id: string;
  workspace_id: string;
  project_id: string;
  domain: string;
  start_url: string;
  max_pages: number;
  excluded_paths: string[];
}): Promise<void> {
  const sql = getDb();
  await sql`
    INSERT INTO outbox_events (aggregate_type, aggregate_id, event_type, payload)
    VALUES ('audit_run', ${payload.audit_run_id}, 'audit.start', ${sql.json(payload)})
  `;
}
