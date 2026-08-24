import { Router, Request, Response } from "express";
import multer, { FileFilterCallback } from "multer";
import path from "path";
import { db } from "../db/client";
import { addJob } from "../queues/pipeline.queue";

const router = Router()

/**  Handle file storage after upload
* multer.diskStorage takes two properties destination and filename
* destination - handles where uploaded files are saved -- uploads directory in this case
* filename    - sets the name of the file with which it will be stored
* path.extname extracts the file extension (pdf, jpg etc), multer doesn't handle this by default unfortunately
*/
const storage = multer.diskStorage({
    destination: (req, file, cb)  => {
        cb(null, "uploads/");
    },
    filename: (req, file, cb) => {
        // use of timestamp + random number to prevent collision of two users upload file with same name
        cb(null, file.fieldname + '-' + Date.now() + '-' + Math.round(Math.random() * 1e9) + path.extname(file.originalname));
    }
});

/** 
* Filter out any file type that is not pdf
* cb(null, true) is for accepted files
*/ 
const fileFilter = (req: Request, file: Express.Multer.File, cb: FileFilterCallback): void => {
    const isPdfMime = file.mimetype === "application/pdf";
    
    if (isPdfMime) {
        cb(null, true);
    }
    else {
        cb(new Error('Only PDF files are allowed'));
    }
};

/**
 * Multer config object
 * Takes an options object
 * I used the storage property instead of dest property for more control, which is to set 
 * custom filenames and set destination for uploaded files
 * Applied fileFilter property to only accept pdf's
 */
const upload = multer({ 
    storage: storage,
    fileFilter: fileFilter
});

/**
 * Accept upload of single files only with input field name named 'file'
 */
router.post("/", upload.single('file'), async (req: Request, res: Response) => {
        try {
            // Guard against no file upload
            if (!req.file) {
                // status 400 - client sent bad request
                res.status(400).json({error: "No file uploaded"});
                return;
            }
            
            /**
             * Create row for the uploaded document in db in the documents table
             * The document info returned is done so to provide client response
             */
            const insertToDb = await db.query(
               `INSERT INTO documents (filename, original_name, status, user_id)
                VALUES($1, $2, 'pending', $3)
                RETURNING id, filename, original_name, status, created_at, completed_at, user_id`,
                [req.file.filename, req.file.originalname, req.userId]
            );

            const document = insertToDb.rows[0];

            /**
             * Create row for uploaded documents first job (extract) in jobs table in db
             */
            const jobRecord = await db.query(
               `INSERT INTO jobs (document_id, job_type, status)
                VALUES($1, 'extract', 'pending')
                RETURNING id`,
                [document.id]
            );

            /** This is the extract jobId
             * jobId is passed through the BullMQ payload so the extract worker 
             * can update its own jobs table row without a separate lookup query
             */
            const jobId = jobRecord.rows[0].id;
            
            // Enqueue job (extract) to the pipeline
            await addJob({
                documentId: document.id,
                jobType: "extract",
                data: { filename: document.filename, jobId },
            });
            
            // Return success message
            res.status(201).json({ 
                message: "File upload successful!",
                document
            });
        } catch(error) {
            console.error('File upload failed', error);
            // status 500 - unexpected server error
            return res.status(500).json({ error: 'File upload error'});
        }
});

export default router;