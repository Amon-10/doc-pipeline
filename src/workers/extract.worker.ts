import { Worker, Job } from "bullmq";
import { promises as fs } from "fs";
import path from "path";
import { db } from "../db/client";
import { addJob, connection } from "../queues/pipeline.queue";
import type { JobPayload } from "../queues/pipeline.queue";

const pdfParse = require("pdf-parse");

const extractWorker = new Worker("pipeline", async (job: Job<JobPayload>) => {
    const documentId = job.data.documentId;
    const filename = job.data.data?.filename as string;
    const jobId = job.data.data?.jobId;

    try {
        if(!filename) {
            throw new Error(`No filename provided for document ${documentId}`)
        }

        // Update status to processing in documents
        await db.query(
           `UPDATE documents
            SET status = 'processing'
            WHERE id = $1`,
            [documentId]
        );
        
        // Read file from disk
        const filePath = path.join("uploads", filename);
        const fileBuffer = await fs.readFile(filePath);
        const pdfData = await pdfParse(fileBuffer);

        await addJob({
            documentId,
            jobType: "chunk",
            data: { text: pdfData.text },
        });

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
        
        // Rethrow so BullMQ triggers retry
        throw err;
    }
}, {connection} )