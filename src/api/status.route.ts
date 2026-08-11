import { Router, Request, Response } from "express";
import { db } from "../db/client";

const router = Router();

/**
 * GET /status/:documentId
 * Returns a document's overall status plus the status of every job
 * associated with it, so a client can poll progress after uploading.
 */
router.get("/:documentId", async (req: Request, res: Response) => {
    try {
        const { documentId } = req.params;

        const documentResult = await db.query(
            `SELECT id, status, email, filename, created_at, completed_at
            FROM documents
            WHERE id = $1`,
            [documentId]
        );

        // 404 — the resource itself doesn't exist, distinct from a bad
        // request (400) or a server error (500)
        if (documentResult.rows.length === 0) {
            res.status(404).json({ error: "Document not found" });
            return;
        }

        const document = documentResult.rows[0];

        const jobsResult = await db.query(
            `SELECT id, job_type, status, attempt_count, error, created_at, completed_at
            FROM jobs
            WHERE document_id = $1
            ORDER BY created_at`,
            [documentId]
        );

        res.status(200).json({
            document,
            jobs: jobsResult.rows,
        });

    } catch (error) {
        console.error("Status check failed", error);
        res.status(500).json({ error: "Failed to retrieve status" });
    }
});

export default router;