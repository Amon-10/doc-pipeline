"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.failJobAttempt = exports.startJobAttempt = void 0;
const bullmq_1 = require("bullmq");
const client_1 = require("../db/client");
const startJobAttempt = async (job, jobId) => {
    // BullMQ has not incremented attemptsMade for the current run yet.
    await client_1.db.query(`UPDATE jobs
     SET status = 'processing', attempt_count = $2, error = NULL, completed_at = NULL
     WHERE id = $1`, [jobId, job.attemptsMade + 1]);
};
exports.startJobAttempt = startJobAttempt;
const failJobAttempt = async (job, jobId, documentId, error) => {
    // The current failure becomes BullMQ's next attemptsMade value after this processor throws.
    const attemptCount = job.attemptsMade + 1;
    const maxAttempts = job.opts.attempts ?? 1;
    const finalFailure = attemptCount >= maxAttempts ||
        error instanceof bullmq_1.UnrecoverableError ||
        (error instanceof Error && error.name === "UnrecoverableError");
    await client_1.db.query(`UPDATE jobs
     SET status = $2, attempt_count = $3, error = $4, completed_at = NULL
     WHERE id = $1`, [jobId, finalFailure ? "failed" : "retrying", attemptCount,
        error instanceof Error ? error.message : "Unknown error"]);
    // Email delivery has its own status; a failed notification does not undo a completed summary.
    if (finalFailure && job.data.jobType !== "notify") {
        await client_1.db.query(`UPDATE documents SET status = 'failed' WHERE id = $1`, [documentId]);
    }
};
exports.failJobAttempt = failJobAttempt;
