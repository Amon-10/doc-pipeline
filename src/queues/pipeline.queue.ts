import { Queue } from "bullmq";

/**
 * Redis connection config used by BullMQ.
 * Host defaults to "redis" — the Docker service name, not localhost,
 * since this connects to Redis from inside the app container.
 */
export const connection = {
  host: process.env.REDIS_HOST || "redis",
  port: parseInt(process.env.REDIS_PORT || "6379"),
};

/**
 * Valid job names in the pipeline.
 * Restricting to this union prevents typos like "extrct" from compiling.
 */
export type JobType =
  | "extract"
  | "chunk"
  | "summarize"
  | "merge"
  | "notify";

// one dedicated queue per job type — prevents workers from competing for jobs meant for a different stage
const queues: Record<JobType, Queue> = {
  extract: new Queue("extract", { connection }),
  chunk: new Queue("chunk", { connection }),
  summarize: new Queue("summarize", { connection }),
  merge: new Queue("merge", { connection }),
  notify: new Queue("notify", { connection }),
};

/**
 * Shape of every job added to the pipeline queue.
 *
 * @property documentId - links the job back to its document
 * @property jobType - which stage of the pipeline this job represents
 * @property data - optional payload passed between workers (e.g. extracted text).
 * Typed as Record<string, unknown> - typescript buitin generic type
 *     - it means object with key of type string and value with unknown type
 * unknown forces a type check before use, unlike any which disables checking entirely.
 */
export interface JobPayload {
  documentId: string;
  jobType: JobType;
  data?: Record<string, unknown>;
}

/** Shape of job.data.data for extract jobs. */
export interface ExtractJobData {
  filename: string;
  jobId: string;
}

/** Shape of job.data.data for chunk jobs. */
export interface ChunkJobData {
  text: string;
  jobId: string
}

/** Shape of job.data.data for summarize jobs. */
export interface SummarizeJobData {
  chunk: string;
  jobId: string;
  chunkIndex: number;
}

export interface MergeJobData {
  jobId: string;
}

/**
 * Adds a job to the pipeline queue with automatic retry.
 *
 * @param payload - job data matching the JobPayload shape
 *
 * Retries failed jobs up to 3 times with exponential backoff —
 * the wait between retries doubles each time (2s, 4s, 8s),
 * giving external services like OpenAI room to recover from rate limits.
 */
export const addJob = async (payload: JobPayload) => {
  const queue = queues[payload.jobType];
  await queue.add(payload.jobType, payload, {
    attempts: 3,
    backoff: {
      type: "exponential",
      delay: 2000,
    },
  });
};