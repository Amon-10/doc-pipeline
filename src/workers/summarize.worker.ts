import { summarizeChunk } from "../lib/openai";
import { db } from "../db/client";
import type { SummarizeJobData, JobPayload } from "../queues/pipeline.queue";
import { Worker, Job } from "bullmq";
import { connection, addJob } from "../queues/pipeline.queue";

const summarizeWorker = new Worker("summarize", async(job: Job<JobPayload>) => {

    const documentId = job.data.documentId;
    const data = job.data.data as unknown as SummarizeJobData;
    const chunk = data.chunk;
    const jobId = data.jobId;
    const chunkIndex = data.chunkIndex;
    
    try {
        if (!chunk) {
            throw new Error(`No chunk provided for document ${documentId}`);
        }

        // Get chunk summary
        const chunkSummary = await summarizeChunk(chunk);

        /**
         * Advisory lock fix for fan-in race condition:
         * All three operations — insert summary, count summaries, enqueue merge —
         * happen inside a single transaction. pg_try_advisory_xact_lock ensures
         * only one worker can reach the count check at a time for a given document.
         * The lock is scoped to the transaction and releases automatically on COMMIT.
         * The other worker gets false back and skips enqueuing — no double merge.
         */
        const client = await db.connect();

        try {
            await client.query('BEGIN');

            // Save this chunk's summary inside the transaction
            const summaryRecord = await client.query(
                `INSERT INTO summaries (document_id, chunk_index, content, created_at)
                VALUES ($1, $2, $3, now())
                RETURNING id`,
                [documentId, chunkIndex, chunkSummary]
            );
            const summaryId = summaryRecord.rows[0].id;

            // Try to acquire advisory lock on this document
            // Only one worker can hold this lock at a time
            const lockResult = await client.query(
                `SELECT pg_try_advisory_xact_lock(('x' || substr(md5($1), 1, 16))::bit(64)::bigint)`,
                [documentId]
            );
            const acquiredLock = lockResult.rows[0].pg_try_advisory_xact_lock;

            if (acquiredLock) {
                const documentsResult = await client.query(
                    `SELECT total_chunks FROM documents WHERE id = $1`,
                    [documentId]
                );
                const totalChunks = documentsResult.rows[0].total_chunks;

                const summariesResult = await client.query(
                    `SELECT COUNT(*) FROM summaries WHERE document_id = $1`,
                    [documentId]
                );
                const totalSummaries = Number(summariesResult.rows[0].count);

                if (totalChunks === totalSummaries) {
                    const mergeJobRecord = await client.query(
                        `INSERT INTO jobs (document_id, job_type, status)
                        VALUES ($1, 'merge', 'pending')
                        RETURNING id`,
                        [documentId]
                    );
                    const mergeJobId = mergeJobRecord.rows[0].id;

                    await addJob({
                        documentId,
                        jobType: "merge",
                        data: { jobId: mergeJobId },
                    });
                }
            }

            await client.query('COMMIT');
        } catch (err) {
            await client.query('ROLLBACK');
            throw err;
        } finally {
            client.release(); // always runs — returns connection back to pool
        }

        // Mark this summarize job complete
        await db.query(
            `UPDATE jobs
            SET completed_at = now(),
            status = 'completed'
            WHERE id = $1`,
            [jobId]
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

        throw err;
    }

}, {connection, concurrency: 5, limiter: { max: 5, duration: 1000 }})