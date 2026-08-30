import { summarizeChunk } from "../lib/openai";
import { db } from "../db/client";
import type { SummarizeJobData, JobPayload } from "../queues/pipeline.queue";
import { Worker, Job } from "bullmq";
import { connection, addJob } from "../queues/pipeline.queue";

export const processSummarizeJob = async(job: Job<JobPayload>) => {

    const documentId = job.data.documentId;
    const data = job.data.data as unknown as SummarizeJobData;
    const chunk = data.chunk;
    const jobId = data.jobId; // summarize jobId
    const chunkIndex = data.chunkIndex;
    
    try{
        if (!chunk) {
            throw new Error(`No chunk provided for document ${documentId}`);
        }

        // Get chunk summary
        const chunkSummary = await summarizeChunk(chunk);

        // save this chunk's summary — chunk_index preserves original order for merge later
        const summaryRecord = await db.query(
            `INSERT INTO summaries (document_id, chunk_index, content, created_at)
            VALUES ($1, $2, $3, now())
            RETURNING id`,
            [documentId, chunkIndex, chunkSummary]
        );
        const summaryId = summaryRecord.rows[0].id;

        /**
         * Fan-in check: summarize jobs run in parallel and finish in unpredictable
         * order, so chunkIndex alone can't tell me who finishes last. Instead,
         * compare how many summaries exist so far against total_chunks — whichever
         * job's insert makes the count match is the one that triggers merge.
         * Known limitation: two jobs finishing at nearly the same instant could
         * both see the same count and both trigger merge (race condition) —
         * acceptable for this project's scale, would need a transaction lock
         * or atomic counter to fully close in production.
         */
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

        // mark this summarize job complete regardless of whether it triggered merge
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
    // concurrency: 5 lets up to 5 chunks summarize at once — OpenAI calls are
    // slow and independent per chunk, so running them in parallel meaningfully
    // speeds up how fast a whole document finishes
};

if (process.env.NODE_ENV !== "test") new Worker("summarize", processSummarizeJob,
  {connection, concurrency: 5, limiter: { max: 5, duration: 1000 }});
