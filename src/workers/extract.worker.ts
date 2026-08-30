import { Worker, Job } from "bullmq";
import { promises as fs } from "fs";
import path from "path";
import { db } from "../db/client";
import { addJob, connection } from "../queues/pipeline.queue";
import type { ExtractJobData, JobPayload } from "../queues/pipeline.queue";
type PdfParser = (buffer: Buffer) => Promise<{ text: string }>;

// pdf-parse exposes a CommonJS function. Keep require() here because using a
// default ESM import has caused runtime interop failures with this package.
const pdfParse: PdfParser = require("pdf-parse");

/** Allows tests to substitute PDF parsing without changing production loading. */
export const createExtractJobProcessor = (parsePdf: PdfParser = pdfParse) => async (job: Job<JobPayload>) => {

    const documentId = job.data.documentId;
    const data = job.data.data as unknown as ExtractJobData; // typecheck as unknown and then with my custom defined type - ExtractJobData
    const filename = data.filename
    const jobId = data.jobId; // carries extract jobId

    try {
        // check for if filename isn't found - may indicate payload wasn't constructed correctly
        // throw error so BullMQ retries
        if(!filename) {
            throw new Error(`No filename provided for document ${documentId}`)
        }

        // Update status to processing in documents table
        await db.query(
           `UPDATE documents
            SET status = 'processing'
            WHERE id = $1`,
            [documentId]
        );
        
        // Read file from disk
        const filePath = path.join("uploads", filename); // create path to pdf on disk
        const fileBuffer = await fs.readFile(filePath); // extract binary pdf contents
        const pdfData = await parsePdf(fileBuffer); // extract raw text from binary pdf contents

        /**
         * Insert and create to chunk row in jobs table
         * return id to be used as chunk job id in chunk worker
        */
        const chunkJobRecord = await db.query(
            `INSERT INTO jobs (document_id, job_type, status)
            VALUES ($1, 'chunk', 'pending')
            RETURNING id`,
            [documentId]
        );

        // carries chunk jobId
        const chunkJobId = chunkJobRecord.rows[0].id;

        /**
         * Enqueue chunk job to pipeline
         * pass forward all pdfData as string and chunk jobId to chunk worker through the payload
         */
        await addJob({
            documentId,
            jobType: "chunk",
            data: { text: pdfData.text, jobId: chunkJobId },
        });

        // Update jobs table to signify extract job is completed and when it was completed
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
        
        // Rethrow so BullMQ triggers retry
        throw err;
    }
};

export const processExtractJob = createExtractJobProcessor();

if (process.env.NODE_ENV !== "test") new Worker("extract", processExtractJob,
/**
 * Passing {connection: connection} as {connection}
 * typescript shortform
 * basically results in connection: {host: "redis", port: 6379}
 */
{connection} );
