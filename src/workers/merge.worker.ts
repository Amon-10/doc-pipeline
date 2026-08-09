import { db } from "../db/client";
import type { MergeJobData, JobPayload } from "../queues/pipeline.queue";
import { Worker, Job } from "bullmq";
import { connection, addJob } from "../queues/pipeline.queue";
import { mergeSummaries } from "../lib/openai";

const mergeWorker = new Worker("merge", async (job: Job<JobPayload>) => {
    const documentId = job.data.documentId;
    const data = job.data.data as unknown as MergeJobData;
    const jobId = data.jobId; // merge jobId
    
    try {
        const summariesResult = await db.query(
            `SELECT content
            FROM summaries
            WHERE document_id = $1
            ORDER BY chunk_index`,
            [documentId]
        );
        const combinedText = summariesResult.rows
            .map(row => row.content)
            .join(' ');
        
        // Get final coherent merged summary
        const mergedSummary = await mergeSummaries(combinedText);

        // save final summary to summaries
        await db.query(
            `INSERT INTO summaries (document_id, chunk_index, content, created_at)
            VALUES ($1, NULL, $2, now())`,
            [documentId, mergedSummary]
        );

        const notifyJobRecord = await db.query(
            `INSERT INTO jobs (document_id, job_type, status)
            VALUES ($1, 'notify', 'pending')
            RETURNING id`,
            [documentId]
        );

        const notifyJobId = notifyJobRecord.rows[0].id;

        await addJob({
            documentId,
            jobType: "notify",
            data: { jobId: notifyJobId, summary: mergedSummary },
        });

        await db.query(
            `UPDATE jobs
            SET completed_at = now(),
            status = 'completed'
            WHERE id = $1`,
            [jobId]
        );

        // document processing is done
        await db.query(
            `UPDATE documents
            SET status = 'done',
            completed_at = now()
            WHERE id = $1`,
            [documentId]
        );

    } catch(err) {
        await db.query(
           `UPDATE documents
            SET status = 'failed'
            WHERE id = $1`,
            [documentId]
        );

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