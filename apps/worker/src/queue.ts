import { Queue, Worker, type ConnectionOptions } from 'bullmq';

export function getRedisConnection(): ConnectionOptions {
  const url = process.env.REDIS_URL ?? 'redis://localhost:6379';
  const parsed = new URL(url);
  return {
    host: parsed.hostname,
    port: parseInt(parsed.port || '6379', 10),
    password: parsed.password || undefined,
  };
}

export const QUEUE_NAMES = {
  CRAWL: 'citescope-crawl',
  RULES: 'citescope-rules',
  REPORT: 'citescope-report',
} as const;

export function createQueue(name: string): Queue {
  return new Queue(name, {
    connection: getRedisConnection(),
    defaultJobOptions: {
      attempts: 3,
      backoff: { type: 'exponential', delay: 5000 },
      removeOnComplete: { count: 100 },
      removeOnFail: { count: 500 },
    },
  });
}

export const crawlQueue = createQueue(QUEUE_NAMES.CRAWL);
export const rulesQueue = createQueue(QUEUE_NAMES.RULES);
export const reportQueue = createQueue(QUEUE_NAMES.REPORT);
