import { Queue, Worker, QueueEvents, JobsOptions, Job } from 'bullmq';
import { getRedis } from './redis';
import { env } from '../config/env';

// Check if Redis is available
let connection: any = null;
let addCardQueue: any = null;
let addCardQueueEvents: any = null;

if (!env.REDIS_URL) {
  console.warn('Redis URL not set; queue disabled and using mock implementations');
  // Create mock objects (no Redis connection attempts)
  addCardQueue = {
    add: () => Promise.resolve({ id: 'mock-job-id' }),
    getWaiting: () => Promise.resolve([]),
    getActive: () => Promise.resolve([]),
    getCompleted: () => Promise.resolve([]),
    getFailed: () => Promise.resolve([]),
    getDelayed: () => Promise.resolve([]),
    pause: () => Promise.resolve(),
    resume: () => Promise.resolve(),
    clean: () => Promise.resolve(),
    getJob: () => Promise.resolve(null)
  };
  addCardQueueEvents = {
    on: () => {},
    off: () => {},
  } as any;
} else {
  try {
    connection = getRedis();
    addCardQueue = new Queue('add-card', { 
      connection: connection,
      defaultJobOptions: {
        removeOnComplete: 100,
        removeOnFail: 50,
        attempts: 3,
        backoff: { type: 'exponential', delay: 2000 }
      }
    });
    addCardQueueEvents = new QueueEvents('add-card', { 
      connection: connection
    });
  } catch (error) {
    console.warn('Redis not available, queue functionality will be limited:', error instanceof Error ? error.message : String(error));
    // Create mock objects
    addCardQueue = {
      add: () => Promise.resolve({ id: 'mock-job-id' }),
      getWaiting: () => Promise.resolve([]),
      getActive: () => Promise.resolve([]),
      getCompleted: () => Promise.resolve([]),
      getFailed: () => Promise.resolve([]),
      getDelayed: () => Promise.resolve([]),
      pause: () => Promise.resolve(),
      resume: () => Promise.resolve(),
      clean: () => Promise.resolve(),
      getJob: () => Promise.resolve(null)
    };
    addCardQueueEvents = {
      on: () => {},
      off: () => {},
    } as any;
  }
}

// Enhanced job data interface
export interface AddCardJobData {
  cookieId: string;
  cardId: string;
  serverId?: string;
  proxyConfig?: {
    type: 'http' | 'https' | 'socks5';
    host: string;
    port: number;
    username?: string;
    password?: string;
    country?: string;
  };
  maxConcurrent?: number;
  retryAttempts?: number;
  priority?: number;
  preferences?: any;
}

export function enqueueAddCardJob(data: AddCardJobData, opts?: JobsOptions) {
  const jobOptions: JobsOptions = {
    attempts: data.retryAttempts || 3,
    backoff: { type: 'exponential', delay: 2000 },
    removeOnComplete: 100,
    removeOnFail: 50,
    priority: data.priority || 0,
    ...opts
  };

  return addCardQueue.add('add', data, jobOptions);
}

export function makeAddCardWorker(processor: (data: AddCardJobData, job: Job) => Promise<any>) {
  if (!env.REDIS_URL) {
    // return mock worker
    return {
      on: () => {},
      close: async () => {},
    } as any;
  }

  const worker = new Worker('add-card', async (job) => {
    const data = job.data as AddCardJobData;
    
    // Add job metadata
    job.updateProgress(0);
    
    try {
      // Process the job
      const result = await processor(data, job);
      
      // Update progress to 100% on success
      job.updateProgress(100);
      
      return result;
    } catch (error) {
      // Log error details
      console.error(`Job ${job.id} failed:`, error);
      
      // Update progress to indicate failure
      job.updateProgress(-1);
      
      throw error;
    }
  }, { 
    connection: connection,
    concurrency: 10, // Default concurrency
    maxStalledCount: 2,
    stalledInterval: 30000
  });

  // Handle worker events
  worker.on('completed', (job) => {
    if (job) {
      console.log(`Job ${job.id} completed successfully`);
    }
  });

  worker.on('failed', (job, err) => {
    if (job) {
      console.error(`Job ${job.id} failed:`, err.message);
    }
  });

  worker.on('stalled', (jobId) => {
    console.warn(`Job ${jobId} stalled`);
  });

  return worker;
}

// Queue management functions
export async function getQueueStats() {
  const [waiting, active, completed, failed, delayed] = await Promise.all([
    addCardQueue.getWaiting(),
    addCardQueue.getActive(),
    addCardQueue.getCompleted(),
    addCardQueue.getFailed(),
    addCardQueue.getDelayed()
  ]);

  return {
    waiting: waiting.length,
    active: active.length,
    completed: completed.length,
    failed: failed.length,
    delayed: delayed.length
  };
}

export async function pauseQueue() {
  await addCardQueue.pause();
  return { status: 'paused' };
}

export async function resumeQueue() {
  await addCardQueue.resume();
  return { status: 'resumed' };
}

export async function clearQueue() {
  await addCardQueue.clean(0, 0, 'active');
  await addCardQueue.clean(0, 0, 'wait');
  await addCardQueue.clean(0, 0, 'delayed');
  await addCardQueue.clean(0, 0, 'failed');
  await addCardQueue.clean(0, 0, 'completed');
  return { status: 'cleared' };
}

export async function getJobDetails(jobId: string) {
  const job = await addCardQueue.getJob(jobId);
  if (!job) return null;
  
  return {
    id: job.id,
    data: job.data,
    progress: job.progress,
    status: await job.getState(),
    attempts: job.attemptsMade,
    timestamp: job.timestamp,
    processedOn: job.processedOn,
    finishedOn: job.finishedOn,
    failedReason: job.failedReason
  };
}

export function getQueueEvents() {
  return addCardQueueEvents as QueueEvents;
} 