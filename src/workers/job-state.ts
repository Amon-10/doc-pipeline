import { Job, UnrecoverableError } from "bullmq";
import { db } from "../db/client";
import type { JobPayload } from "../queues/pipeline.queue";

export const startJobAttempt = async (job: Job<JobPayload>, jobId: string) => {
  // BullMQ has not incremented attemptsMade for the current run yet.
  await db.query(
    `UPDATE jobs
     SET status = 'processing', attempt_count = $2, error = NULL, completed_at = NULL
     WHERE id = $1`,
    [jobId, job.attemptsMade + 1]
  );
};

export const failJobAttempt = async (
  job: Job<JobPayload>,
  jobId: string,
  documentId: string,
  error: unknown,
) => {
  // The current failure becomes BullMQ's next attemptsMade value after this processor throws.
  const attemptCount = job.attemptsMade + 1;
  const maxAttempts = job.opts.attempts ?? 1;
  const finalFailure = attemptCount >= maxAttempts ||
    error instanceof UnrecoverableError ||
    (error instanceof Error && error.name === "UnrecoverableError");

  await db.query(
    `UPDATE jobs
     SET status = $2, attempt_count = $3, error = $4, completed_at = NULL
     WHERE id = $1`,
    [jobId, finalFailure ? "failed" : "retrying", attemptCount,
      error instanceof Error ? error.message : "Unknown error"]
  );

  // Email delivery has its own status; a failed notification does not undo a completed summary.
  if (finalFailure && job.data.jobType !== "notify") {
    await db.query(
      `UPDATE documents SET status = 'failed' WHERE id = $1`,
      [documentId]
    );
  }
};
