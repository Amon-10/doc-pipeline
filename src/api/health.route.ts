import { Router } from "express";
import { db } from "../db/client";
import { getQueue } from "../queues/pipeline.queue";
import type { JobType } from "../queues/pipeline.queue";

const router = Router();
const queueNames: JobType[] = ["extract", "chunk", "summarize", "merge", "notify"];
const healthTimeoutMs = 3000;

const checkHealth = async (operation: () => Promise<unknown>): Promise<"ok" | "error"> => {
    let timeout: ReturnType<typeof setTimeout> | undefined;
    try {
        await Promise.race([
            operation(),
            new Promise<never>((_, reject) => {
                timeout = setTimeout(() => reject(new Error("Health check timed out")), healthTimeoutMs);
            }),
        ]);
        return "ok";
    } catch {
        return "error";
    } finally {
        if (timeout) clearTimeout(timeout);
    }
};

router.get("/", async (_req, res) => {
    const results = await Promise.all([
        checkHealth(() => db.query("SELECT 1")),
        checkHealth(async () => (await getQueue("extract").client).info()),
        ...queueNames.map((name) => checkHealth(() => getQueue(name).getJobCounts())),
    ]);
    const [database, redis, ...queueResults] = results;
    const queues = Object.fromEntries(queueNames.map((name, index) => [name, queueResults[index]]));
    const healthy = results.every((result) => result === "ok");

    res.status(healthy ? 200 : 503).json({
        status: healthy ? "ok" : "unhealthy",
        checks: { database, redis, queues },
    });
});

export default router;
