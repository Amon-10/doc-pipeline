"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.processMergeJob = void 0;
const client_1 = require("../db/client");
const bullmq_1 = require("bullmq");
const pipeline_queue_1 = require("../queues/pipeline.queue");
const openai_1 = require("../lib/openai");
const job_state_1 = require("./job-state");
const processMergeJob = async (job) => {
    const documentId = job.data.documentId;
    const data = job.data.data;
    const jobId = data.jobId; // merge jobId
    try {
        await (0, job_state_1.startJobAttempt)(job, jobId);
        // gather every chunk's summary in original order so the synthesized
        // result reads coherently rather than jumbled
        const summariesResult = await client_1.db.query(`SELECT content
            FROM summaries
            WHERE document_id = $1
            ORDER BY chunk_index`, [documentId]);
        const combinedText = summariesResult.rows
            .map(row => row.content)
            .join(' ');
        // reduce step of the pipeline — synthesizes N parallel chunk
        // summaries (the map step, done in summarize worker) into one
        // Get final coherent merged summary
        const mergedSummary = await (0, openai_1.mergeSummaries)(combinedText);
        // save final summary to summaries
        // chunk_index NULL marks this as the final merged summary,
        // distinct from the individual chunk rows already in this table
        await client_1.db.query(`INSERT INTO summaries (document_id, chunk_index, content, created_at)
            VALUES ($1, NULL, $2, now())`, [documentId, mergedSummary]);
        const notifyJobRecord = await client_1.db.query(`INSERT INTO jobs (document_id, job_type, status)
            VALUES ($1, 'notify', 'pending')
            RETURNING id`, [documentId]);
        const notifyJobId = notifyJobRecord.rows[0].id;
        await (0, pipeline_queue_1.addJob)({
            documentId,
            jobType: "notify",
            data: { jobId: notifyJobId, summary: mergedSummary },
        });
        await client_1.db.query(`UPDATE jobs
            SET completed_at = now(),
            status = 'completed'
            WHERE id = $1`, [jobId]);
        // document processing is done
        await client_1.db.query(`UPDATE documents
            SET status = 'done',
            completed_at = now()
            WHERE id = $1`, [documentId]);
        console.log("Document processing completed", { documentId, jobId });
    }
    catch (err) {
        await (0, job_state_1.failJobAttempt)(job, jobId, documentId, err);
        console.error(err);
        throw err; // rethrow so BullMQ triggers retry
    }
};
exports.processMergeJob = processMergeJob;
if (process.env.NODE_ENV !== "test")
    new bullmq_1.Worker("merge", exports.processMergeJob, { connection: pipeline_queue_1.connection });
