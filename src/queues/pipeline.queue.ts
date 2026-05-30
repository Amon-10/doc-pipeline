import { Queue, Worker, Job } from "bullmq";
import IORedis from "ioredis";

export const connection = new IORedis(process.env.REDIS_URL || "redis://redis:6379", {
  maxRetriesPerRequest: null,
});

export const pipelineQueue = new Queue("pipeline", { connection });

export type JobType =
  | "extract"
  | "chunk"
  | "summarize"
  | "merge"
  | "notify";

export interface JobPayload {
  documentId: string;
  jobType: JobType;
  data?: Record<string, unknown>;
}

export const addJob = async (payload: JobPayload) => {
  await pipelineQueue.add(payload.jobType, payload, {
    attempts: 3,
    backoff: {
      type: "exponential",
      delay: 2000,
    },
  });
};