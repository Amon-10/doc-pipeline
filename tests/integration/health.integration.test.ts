import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { db } from "../../src/db/client";
import { getQueue } from "../../src/queues/pipeline.queue";
import { startApi } from "./helpers";

describe("health endpoint", () => {
    let baseUrl: string;
    let close: () => Promise<void>;

    beforeAll(async () => ({ baseUrl, close } = await startApi()));
    afterAll(async () => close());

    it("reports healthy dependencies and queues", async () => {
        const response = await fetch(`${baseUrl}/health`);

        expect(response.status).toBe(200);
        expect(await response.json()).toEqual({
            status: "ok",
            checks: {
                database: "ok",
                redis: "ok",
                queues: {
                    extract: "ok",
                    chunk: "ok",
                    summarize: "ok",
                    merge: "ok",
                    notify: "ok",
                },
            },
        });
    });

    it("returns 503 when Postgres is unavailable", async () => {
        const query = vi.spyOn(db, "query").mockRejectedValueOnce(new Error("database unavailable"));
        try {
            const response = await fetch(`${baseUrl}/health`);
            expect(response.status).toBe(503);
            expect(await response.json()).toMatchObject({ status: "unhealthy", checks: { database: "error" } });
        } finally {
            query.mockRestore();
        }
    });

    it("returns 503 when the Redis check fails", async () => {
        const client = await getQueue("extract").client;
        const info = vi.spyOn(client, "info").mockRejectedValueOnce(new Error("redis unavailable"));
        try {
            const response = await fetch(`${baseUrl}/health`);
            expect(response.status).toBe(503);
            expect(await response.json()).toMatchObject({ status: "unhealthy", checks: { redis: "error" } });
        } finally {
            info.mockRestore();
        }
    });

    it("returns 503 when a queue check fails", async () => {
        const counts = vi.spyOn(getQueue("merge"), "getJobCounts").mockRejectedValueOnce(new Error("queue unavailable"));
        try {
            const response = await fetch(`${baseUrl}/health`);
            expect(response.status).toBe(503);
            expect(await response.json()).toMatchObject({
                status: "unhealthy",
                checks: { queues: { merge: "error" } },
            });
        } finally {
            counts.mockRestore();
        }
    });
});
