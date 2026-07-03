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
 * The BullMQ queue all pipeline jobs are added to.
 * BullMQ stores all job state for this queue under the name "pipeline" in Redis.
 */
export const pipelineQueue = new Queue("pipeline", { connection });

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
  await pipelineQueue.add(payload.jobType, payload, {
    attempts: 3,
    backoff: {
      type: "exponential",
      delay: 2000,
    },
  });
};