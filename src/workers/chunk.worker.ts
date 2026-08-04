import { Worker, Job } from "bullmq";
import { addJob, connection } from "../queues/pipeline.queue";
import type { ChunkJobData, JobPayload } from "../queues/pipeline.queue";
import { db } from "../db/client";
import { chunkText } from "../lib/chunking";

const chunkWorker = new Worker("pipeline", async (job: Job<JobPayload>) => {
    if (job.name !== 'chunk') return;
    
    const documentId = job.data.documentId;
    const data = job.data.data as unknown as ChunkJobData;
    const text = data.text;
    const jobId = data.jobId; // carries chunk jobId

    try{
        // check for no text
        if (!text) {
            throw new Error(`No text provided for document ${documentId}`)
        }
    
        // text chunks
        const chunks = chunkText(text);

        /**
         * For each chunk create row in jobs table to get summarize jobId
         * Call addJob for each chunk with it's own jobId
         */
        for (const [index, chunk] of chunks.entries()) {
            const summarizeJobRecord = await db.query(
                `INSERT INTO jobs(document_id, job_type, status)
                VALUES ($1, 'summarize', 'pending')
                RETURNING id`,
                [documentId]
            );
            // carries summarize jobId
            const summarizeJobId = summarizeJobRecord.rows[0].id;

            await addJob({
                documentId,
                jobType: "summarize",
                data: {chunk: chunk, jobId: summarizeJobId, chunkIndex: index},
            });
        };

        // Update jobs table to signify chunk job is completed and when it was completed
        await db.query(
           `UPDATE jobs
            SET completed_at = now(),
            status = 'completed'
            WHERE id = $1`,
            [jobId]
        )

    } catch(err) {
        /**
         * Upon error update documents table to failed for row
         */
        await db.query(
           `UPDATE documents
            SET status = 'failed'
            WHERE id = $1`,
            [documentId]
        );

        // Upon error update jobs table to failed for job row
        await db.query(
           `UPDATE jobs
            SET status = 'failed',
            error = $2
            WHERE id = $1`,
            [jobId, err instanceof Error ? err.message : 'Unknown error']
        );
        console.error(err);
        
        // rethrow so BullMq triggers retry
        throw err;
    }

}, {connection})