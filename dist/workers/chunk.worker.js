"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.processChunkJob = void 0;
const bullmq_1 = require("bullmq");
const pipeline_queue_1 = require("../queues/pipeline.queue");
const client_1 = require("../db/client");
const chunking_1 = require("../lib/chunking");
const job_state_1 = require("./job-state");
const processChunkJob = async (job) => {
    const documentId = job.data.documentId;
    const data = job.data.data;
    const text = data.text;
    const jobId = data.jobId; // carries chunk jobId
    try {
        await (0, job_state_1.startJobAttempt)(job, jobId);
        // missing text means the extract worker's payload wasn't constructed correctly
        if (!text) {
            throw new Error(`No text provided for document ${documentId}`);
        }
        const chunks = (0, chunking_1.chunkText)(text);
        const totalChunks = chunks.length;
        await client_1.db.query(`UPDATE documents
            SET total_chunks = $1
            WHERE id = $2`, [totalChunks, documentId]);
        /**
         * One summarize job per chunk rather than one job holding all chunks —
         * lets chunks be summarized in parallel and lets a single failed
         * chunk retry independently without redoing the whole document.
         * chunkIndex is passed through so the merge worker can reassemble
         * summaries in the correct order later.
         */
        for (const [index, chunk] of chunks.entries()) {
            const summarizeJobRecord = await client_1.db.query(`INSERT INTO jobs(document_id, job_type, status)
                VALUES ($1, 'summarize', 'pending')
                RETURNING id`, [documentId]);
            const summarizeJobId = summarizeJobRecord.rows[0].id;
            await (0, pipeline_queue_1.addJob)({
                documentId,
                jobType: "summarize",
                data: { chunk: chunk, jobId: summarizeJobId, chunkIndex: index },
            });
        }
        ;
        // mark the chunk job itself complete — separate from the summarize jobs it spawned
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
};
exports.processChunkJob = processChunkJob;
if (process.env.NODE_ENV !== "test")
    new bullmq_1.Worker("chunk", exports.processChunkJob, { connection: pipeline_queue_1.connection });
