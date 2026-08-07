import { summarizeChunk } from "../lib/openai";
import { db } from "../db/client";
import type { SummarizeJobData, JobPayload } from "../queues/pipeline.queue";
import { Worker, Job } from "bullmq";
import { connection, addJob } from "../queues/pipeline.queue";

const summarizeWorker = new Worker("summarize", async(job: Job<JobPayload>) => {

    const documentId = job.data.documentId;
    const data = job.data.data as unknown as SummarizeJobData;
    const chunk = data.chunk;
    const jobId = data.jobId; // summarize jobId
    const chunkIndex = data.chunkIndex;
    
    try{
        if (!chunk) {
            throw new Error(`No chunk provided for document ${documentId}`);
        }

        const chunkSummary = await summarizeChunk(chunk);

        const summaryRecord = await db.query(
            `INSERT INTO summaries (document_id, chunk_index, content, created_at)
            VALUES ($1, $2, $3, now())
            RETURNING id`,
            [documentId, chunkIndex, chunkSummary]
        );
        const summaryId = summaryRecord.rows[0].id;

        const documentsResult = await db.query(
            `SELECT total_chunks FROM documents WHERE id = $1`,
            [documentId]
        );
        const totalChunks = documentsResult.rows[0].total_chunks

        const summariesResult = await db.query(
            `SELECT COUNT(*)
            FROM summaries
            WHERE document_id = $1`,
            [documentId]
        )
        const totalSummaries = Number(summariesResult.rows[0].count);
        
        if (totalChunks === totalSummaries) {
            const mergeJobRecord = await db.query(
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
        };

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

        throw err; // rethrow so BullMQ triggers retry
    }
}, {connection, concurrency: 5})