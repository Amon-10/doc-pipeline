"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.processSummarizeJob = void 0;
const openai_1 = require("../lib/openai");
const client_1 = require("../db/client");
const bullmq_1 = require("bullmq");
const pipeline_queue_1 = require("../queues/pipeline.queue");
const job_state_1 = require("./job-state");
const processSummarizeJob = async (job) => {
    const documentId = job.data.documentId;
    const data = job.data.data;
    const chunk = data.chunk;
    const jobId = data.jobId; // summarize jobId
    const chunkIndex = data.chunkIndex;
    try {
        await (0, job_state_1.startJobAttempt)(job, jobId);
        if (!chunk) {
            throw new Error(`No chunk provided for document ${documentId}`);
        }
        // Get chunk summary
        const chunkSummary = await (0, openai_1.summarizeChunk)(chunk);
        // save this chunk's summary — chunk_index preserves original order for merge later
        const summaryRecord = await client_1.db.query(`INSERT INTO summaries (document_id, chunk_index, content, created_at)
            VALUES ($1, $2, $3, now())
            RETURNING id`, [documentId, chunkIndex, chunkSummary]);
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
        const documentsResult = await client_1.db.query(`SELECT total_chunks FROM documents WHERE id = $1`, [documentId]);
        const totalChunks = documentsResult.rows[0].total_chunks;
        const summariesResult = await client_1.db.query(`SELECT COUNT(*)
            FROM summaries
            WHERE document_id = $1`, [documentId]);
        const totalSummaries = Number(summariesResult.rows[0].count);
        if (totalChunks === totalSummaries) {
            const mergeJobRecord = await client_1.db.query(`INSERT INTO jobs (document_id, job_type, status)
                VALUES ($1, 'merge', 'pending')
                RETURNING id`, [documentId]);
            const mergeJobId = mergeJobRecord.rows[0].id;
            await (0, pipeline_queue_1.addJob)({
                documentId,
                jobType: "merge",
                data: { jobId: mergeJobId },
            });
        }
        ;
        // mark this summarize job complete regardless of whether it triggered merge
        await client_1.db.query(`UPDATE jobs
            SET completed_at = now(),
            status = 'completed'
            WHERE id = $1`, [jobId]);
    }
    catch (err) {
        await (0, job_state_1.failJobAttempt)(job, jobId, documentId, err);
        console.error(err);
        throw err; // rethrow so BullMQ triggers retry
    }
    // concurrency: 5 lets up to 5 chunks summarize at once — OpenAI calls are
    // slow and independent per chunk, so running them in parallel meaningfully
    // speeds up how fast a whole document finishes
};
exports.processSummarizeJob = processSummarizeJob;
if (process.env.NODE_ENV !== "test")
    new bullmq_1.Worker("summarize", exports.processSummarizeJob, { connection: pipeline_queue_1.connection, concurrency: 5, limiter: { max: 5, duration: 1000 } });
