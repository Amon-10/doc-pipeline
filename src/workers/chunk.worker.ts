import { Worker, Job } from "bullmq";
import { addJob, connection } from "../queues/pipeline.queue";
import type { ChunkJobData, JobPayload } from "../queues/pipeline.queue";
import { db } from "../db/client";
import { chunkText } from "../lib/chunking";

export const processChunkJob = async (job: Job<JobPayload>) => {

    const documentId = job.data.documentId;
    const data = job.data.data as unknown as ChunkJobData;
    const text = data.text;
    const jobId = data.jobId; // carries chunk jobId

    try{
        // missing text means the extract worker's payload wasn't constructed correctly
        if (!text) {
            throw new Error(`No text provided for document ${documentId}`)
        }

        const chunks = chunkText(text);

        const totalChunks = chunks.length;

        await db.query(
            `UPDATE documents
            SET total_chunks = $1
            WHERE id = $2`,
            [totalChunks, documentId]
        );

        /**
         * One summarize job per chunk rather than one job holding all chunks —
         * lets chunks be summarized in parallel and lets a single failed
         * chunk retry independently without redoing the whole document.
         * chunkIndex is passed through so the merge worker can reassemble
         * summaries in the correct order later.
         */
        for (const [index, chunk] of chunks.entries()) {
            const summarizeJobRecord = await db.query(
                `INSERT INTO jobs(document_id, job_type, status)
                VALUES ($1, 'summarize', 'pending')
                RETURNING id`,
                [documentId]
            );
            const summarizeJobId = summarizeJobRecord.rows[0].id;

            await addJob({
                documentId,
                jobType: "summarize",
                data: { chunk: chunk, jobId: summarizeJobId, chunkIndex: index },
            });
        };

        // mark the chunk job itself complete — separate from the summarize jobs it spawned
        await db.query(
           `UPDATE jobs
            SET completed_at = now(),
            status = 'completed'
            WHERE id = $1`,
            [jobId]
        )

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

};

if (process.env.NODE_ENV !== "test") new Worker("chunk", processChunkJob, {connection});
