"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.processNotifyJob = void 0;
const client_1 = require("../db/client");
const bullmq_1 = require("bullmq");
const pipeline_queue_1 = require("../queues/pipeline.queue");
const mailer_1 = require("../lib/mailer");
const job_state_1 = require("./job-state");
const processNotifyJob = async (job) => {
    const documentId = job.data.documentId;
    const data = job.data.data;
    const summary = data.summary;
    const jobId = data.jobId; // notify jobId
    try {
        await (0, job_state_1.startJobAttempt)(job, jobId);
        // check summary - missing summary means the merge worker's payload wasn't constructed correctly
        if (!summary) {
            throw new Error(`No summary provided for document ${documentId}`);
        }
        ;
        /** Get user email */
        const documentsResult = await client_1.db.query(`SELECT users.email FROM documents JOIN users ON documents.user_id = users.id WHERE documents.id = $1`, [documentId]);
        const email = documentsResult.rows[0].email;
        if (!email) {
            throw new Error(`No email provided for document ${documentId}`);
        }
        /** send summary */
        await (0, mailer_1.sendSummaryEmail)(email, summary);
        await client_1.db.query(`UPDATE jobs
            SET completed_at = now(),
            status = 'completed'
            WHERE id = $1`, [jobId]);
        console.log("Document notification sent", { documentId, jobId });
    }
    catch (err) {
        await (0, job_state_1.failJobAttempt)(job, jobId, documentId, err);
        console.error(err);
        throw err; // rethrow so BullMQ triggers retry
    }
};
exports.processNotifyJob = processNotifyJob;
if (process.env.NODE_ENV !== "test")
    new bullmq_1.Worker("notify", exports.processNotifyJob, { connection: pipeline_queue_1.connection });
