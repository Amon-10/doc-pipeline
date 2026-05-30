import { Queue } from "bullmq";

export const connection = {
  host: process.env.REDIS_HOST || "redis",
  port: parseInt(process.env.REDIS_PORT || "6379"),
};

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