"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.processExtractJob = exports.createExtractJobProcessor = void 0;
const bullmq_1 = require("bullmq");
const fs_1 = require("fs");
const path_1 = __importDefault(require("path"));
const client_1 = require("../db/client");
const pipeline_queue_1 = require("../queues/pipeline.queue");
const job_state_1 = require("./job-state");
// pdf-parse exposes a CommonJS function. Keep require() here because using a
// default ESM import has caused runtime interop failures with this package.
const pdfParse = require("pdf-parse");
/** Allows tests to substitute PDF parsing without changing production loading. */
const createExtractJobProcessor = (parsePdf = pdfParse) => async (job) => {
    const documentId = job.data.documentId;
    const data = job.data.data; // typecheck as unknown and then with my custom defined type - ExtractJobData
    const filename = data.filename;
    const jobId = data.jobId; // carries extract jobId
    try {
        await (0, job_state_1.startJobAttempt)(job, jobId);
        // check for if filename isn't found - may indicate payload wasn't constructed correctly
        // throw error so BullMQ retries
        if (!filename) {
            throw new Error(`No filename provided for document ${documentId}`);
        }
        // Update status to processing in documents table
        await client_1.db.query(`UPDATE documents
            SET status = 'processing'
            WHERE id = $1`, [documentId]);
        // Read file from disk
        const filePath = path_1.default.join("uploads", filename); // create path to pdf on disk
        const fileBuffer = await fs_1.promises.readFile(filePath); // extract binary pdf contents
        const pdfData = await parsePdf(fileBuffer); // extract raw text from binary pdf contents
        /**
         * Insert and create to chunk row in jobs table
         * return id to be used as chunk job id in chunk worker
        */
        const chunkJobRecord = await client_1.db.query(`INSERT INTO jobs (document_id, job_type, status)
            VALUES ($1, 'chunk', 'pending')
            RETURNING id`, [documentId]);
        // carries chunk jobId
        const chunkJobId = chunkJobRecord.rows[0].id;
        /**
         * Enqueue chunk job to pipeline
         * pass forward all pdfData as string and chunk jobId to chunk worker through the payload
         */
        await (0, pipeline_queue_1.addJob)({
            documentId,
            jobType: "chunk",
            data: { text: pdfData.text, jobId: chunkJobId },
        });
        // Update jobs table to signify extract job is completed and when it was completed
        await client_1.db.query(`UPDATE jobs
            SET completed_at = now(),
            status = 'completed'
            WHERE id = $1`, [jobId]);
    }
    catch (err) {
        await (0, job_state_1.failJobAttempt)(job, jobId, documentId, err);
        console.error(err);
        // Rethrow so BullMQ triggers retry
        throw err;
    }
};
exports.createExtractJobProcessor = createExtractJobProcessor;
exports.processExtractJob = (0, exports.createExtractJobProcessor)();
if (process.env.NODE_ENV !== "test")
    new bullmq_1.Worker("extract", exports.processExtractJob, 
    /**
     * Passing {connection: connection} as {connection}
     * typescript shortform
     * basically results in connection: {host: "redis", port: 6379}
     */
    { connection: pipeline_queue_1.connection });
