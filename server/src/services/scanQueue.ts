/**
 * BullMQ scan job queue.
 *
 * Manages the queue of library scan jobs and processes them
 * with the scan worker.
 */

import { Queue, Worker, type Job } from 'bullmq';
import { config } from '../config.js';
import { runScan } from './scanWorker.js';

// ─── Types ────────────────────────────────────────────────────────────

export interface ScanJobData {
  jobId: string; // our DB scan job ID
  libraryId: string;
  userId: string;
  libraryPath: string;
  isRemote: boolean;
  remoteHostId?: string;
}

// ─── Redis connection config ─────────────────────────────────────────

function getRedisOpts() {
  const url = new URL(config.REDIS_URL);
  return {
    host: url.hostname,
    port: parseInt(url.port || '6379', 10),
    password: url.password || undefined,
  };
}

// ─── Queue ────────────────────────────────────────────────────────────

const QUEUE_NAME = 'library-scan';

let queue: Queue<ScanJobData> | null = null;
let worker: Worker<ScanJobData> | null = null;

export function getScanQueue(): Queue<ScanJobData> {
  if (!queue) {
    queue = new Queue<ScanJobData>(QUEUE_NAME, {
      connection: getRedisOpts(),
      defaultJobOptions: {
        attempts: 1, // Scans shouldn't auto-retry — let user re-trigger
        removeOnComplete: { count: 50 },
        removeOnFail: { count: 50 },
      },
    });
  }
  return queue;
}

// ─── Worker ──────────────────────────────────────────────────────────

export function startScanWorker(): Worker<ScanJobData> {
  if (worker) return worker;

  worker = new Worker<ScanJobData>(
    QUEUE_NAME,
    async (job: Job<ScanJobData>) => {
      const { jobId, libraryId, userId, libraryPath, isRemote, remoteHostId } = job.data;

      console.log(`[scan-worker] Starting scan job ${jobId} for library ${libraryId}`);

      await runScan({
        jobId,
        libraryId,
        userId,
        libraryPath,
        isRemote,
        remoteHostId,
      });

      console.log(`[scan-worker] Completed scan job ${jobId}`);
    },
    {
      connection: getRedisOpts(),
      concurrency: 1, // Only process one scan at a time
      limiter: {
        max: 1,
        duration: 1000,
      },
    }
  );

  worker.on('failed', (job, error) => {
    console.error(`[scan-worker] Job ${job?.id} failed:`, error);
  });

  worker.on('error', (error) => {
    console.error('[scan-worker] Worker error:', error);
  });

  console.log('[scan-worker] Scan worker started');
  return worker;
}

// ─── Add a job ───────────────────────────────────────────────────────

export async function enqueueScan(data: ScanJobData): Promise<string> {
  const q = getScanQueue();
  const job = await q.add(`scan-${data.libraryId}`, data, {
    jobId: data.jobId, // Use our DB job ID as the BullMQ job ID
  });
  return job.id ?? data.jobId;
}

// ─── Graceful shutdown ───────────────────────────────────────────────

export async function closeScanQueue(): Promise<void> {
  if (worker) {
    await worker.close();
    worker = null;
  }
  if (queue) {
    await queue.close();
    queue = null;
  }
}
