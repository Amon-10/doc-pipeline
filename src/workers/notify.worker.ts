import { db } from "../db/client";
import type { NotifyJobData, JobPayload } from "../queues/pipeline.queue";
import { Worker, Job } from "bullmq";
import { connection } from "../queues/pipeline.queue";
import { sendSummaryEmail } from "../lib/mailer";

const notifyWorker = new Worker("notify", async (job: Job<JobPayload>) => {
    const documentId = job.data.documentId;
    const data = job.data.data as unknown as NotifyJobData;
    const summary = data.summary;
    const jobId = data.jobId; // notify jobId

    try {
        // check summary - missing summary means the merge worker's payload wasn't constructed correctly
        if (!summary) {
            throw new Error(`No summary provided for document ${documentId}`);
        };

        /** Get user email */
        const documentsResult = await db.query(
            `SELECT email FROM documents WHERE id = $1`,
            [documentId]
        );
        const email = documentsResult.rows[0].email;

        if (!email) {
            throw new Error(`No email provided for document ${documentId}`);
        }

        /** send summary */
        await sendSummaryEmail(email, summary);

        await db.query(
            `UPDATE jobs
            SET completed_at = now(),
            status = 'completed'
            WHERE id = $1`,
            [jobId]
        );

    }catch(err) {
        await db.query(
           `UPDATE jobs
            SET status = 'failed',
            error = $2
            WHERE id = $1`,
            [jobId, err instanceof Error ? err.message : 'Unknown error']
        );
        console.error(err);

        throw err; // rethrow so BullMQ triggers retry
    }
}, {connection})