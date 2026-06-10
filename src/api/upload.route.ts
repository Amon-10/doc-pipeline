import { Router, Request, Response } from "express";
import multer, { FileFilterCallback } from "multer";
import path from "path";
import { db } from "../db/client";
import { addJob } from "../queues/pipeline.queue";

const router = Router()

// Handle file upload
// Set destination to /uploads
// Set filename to be file.fieldname + data + randomNum + '.pdf'
const storage = multer.diskStorage({
    destination: (req, file, cb)  => {
        cb(null, "uploads/");
    },
    filename: (req, file, cb) => {
        cb(null, file.fieldname + '-' + Date.now() + '-' + Math.round(Math.random() * 1e9) + path.extname(file.originalname));
    }
});

// Filter out any file type that is not pdf
const fileFilter = (req: Request, file: Express.Multer.File, cb: FileFilterCallback): void => {
    const isPdfMime = file.mimetype === "application/pdf";
    
    if (isPdfMime) {
        cb(null, true);
    }
    else {
        cb(new Error('Only PDF files are allowed'));
    }
};

// Multer config object
const upload = multer({ 
    storage: storage,
    fileFilter: fileFilter
});

// POST
router.post("/", upload.single('file'), async (req: Request, res: Response) => {
        try {
            // Guard against no file upload
            if (!req.file) {
                res.status(400).json({error: "No file uploaded"});
                return;
            }
            
            // Insert to db 
            const insertToDb = await db.query(
               `INSERT INTO documents (filename, original_name, status)
                VALUES($1, $2, 'pending')
                RETURNING id, filename, original_name, status, created_at, completed_at`,
                [req.file.filename, req.file.originalname]
            );

            const document = insertToDb.rows[0];
            
            // Enqueue job to the pipeline
            await addJob({
                documentId: document.id,
                jobType: "extract",
                data: { filename: document.filename },
            });
            
            // Return success message
            res.status(201).json({ 
                message: "File upload successful!",
                document
            });
        } catch(error) {
            console.error('File upload failed', error);
            return res.status(500).json({ error: 'File upload error'});
        }
});

export default router;