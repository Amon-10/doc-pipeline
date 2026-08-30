import { afterEach, describe, expect, it, vi } from "vitest";
import { writeFile, unlink } from "node:fs/promises";
import path from "node:path";
import { db } from "../../src/db/client";
import { getQueue } from "../../src/queues/pipeline.queue";
import { createJob, createUserAndDocument, fakeJob } from "./helpers";

const ai = vi.hoisted(() => ({
  summarizeChunk: vi.fn(async (chunk: string) => `summary:${chunk.slice(0, 12)}`),
  mergeSummaries: vi.fn(async (text: string) => `merged:${text}`),
}));
vi.mock("../../src/lib/openai", () => ai);

import { createExtractJobProcessor } from "../../src/workers/extract.worker";
import { processChunkJob } from "../../src/workers/chunk.worker";
import { processSummarizeJob } from "../../src/workers/summarize.worker";
import { processMergeJob } from "../../src/workers/merge.worker";

describe("processing pipeline integration", () => {
  const temporaryFiles: string[] = [];
  afterEach(async () => {
    vi.clearAllMocks();
    await Promise.all(temporaryFiles.splice(0).map((file) => unlink(file).catch(() => undefined)));
  });

  it("completing extraction creates and queues the chunk step", async () => {
    const { document } = await createUserAndDocument();
    const extractJob = await createJob(document.id, "extract");
    const filename = `integration-${document.id}.pdf`;
    const filePath = path.resolve("uploads", filename);
    temporaryFiles.push(filePath);
    await writeFile(filePath, "%PDF mocked in integration test");

    const parsePdf = vi.fn(async () => ({ text: "Extracted text." }));
    const processExtractJob = createExtractJobProcessor(parsePdf);
    await processExtractJob(fakeJob({ documentId: document.id, jobType: "extract", data: { filename, jobId: extractJob.id } }));
    expect(parsePdf).toHaveBeenCalledOnce();
    expect(Buffer.isBuffer(parsePdf.mock.calls[0][0])).toBe(true);
    const chunkJob = (await db.query("SELECT * FROM jobs WHERE document_id = $1 AND job_type = 'chunk'", [document.id])).rows[0];
    expect(chunkJob.status).toBe("pending");
    expect((await getQueue("chunk").getWaiting())[0].data).toMatchObject({ documentId: document.id, jobType: "chunk" });
    expect((await db.query("SELECT status FROM documents WHERE id = $1", [document.id])).rows[0].status).toBe("processing");
  });

  it("fans chunk work out, persists ordered summaries, and notifies only after merge completes", async () => {
    const { document } = await createUserAndDocument();
    const chunkJob = await createJob(document.id, "chunk");
    const text = `${"first ".repeat(510)}. ${"second ".repeat(510)}.`;
    await processChunkJob(fakeJob({ documentId: document.id, jobType: "chunk", data: { text, jobId: chunkJob.id } }));

    const summarizeRecords = (await db.query("SELECT * FROM jobs WHERE document_id = $1 AND job_type = 'summarize' ORDER BY created_at", [document.id])).rows;
    expect(summarizeRecords).toHaveLength(2);
    const queuedSummaries = await getQueue("summarize").getWaiting();
    expect(queuedSummaries).toHaveLength(2);
    expect(await getQueue("notify").getWaitingCount()).toBe(0);

    const byIndex = new Map(queuedSummaries.map((job) => [job.data.data.chunkIndex, job.data]));
    await processSummarizeJob(fakeJob(byIndex.get(1)!));
    expect(await getQueue("merge").getWaitingCount()).toBe(0);
    await processSummarizeJob(fakeJob(byIndex.get(0)!));
    expect(await getQueue("merge").getWaitingCount()).toBe(1);

    const ordered = (await db.query("SELECT chunk_index, content FROM summaries WHERE document_id = $1 ORDER BY chunk_index", [document.id])).rows;
    expect(ordered.map((row) => row.chunk_index)).toEqual([0, 1]);
    expect(ordered.every((row) => row.content.startsWith("summary:"))).toBe(true);
    expect((await db.query("SELECT status FROM documents WHERE id = $1", [document.id])).rows[0].status).toBe("processing");
    expect(await getQueue("notify").getWaitingCount()).toBe(0);

    const mergePayload = (await getQueue("merge").getWaiting())[0].data;
    await processMergeJob(fakeJob(mergePayload));
    const final = (await db.query("SELECT content FROM summaries WHERE document_id = $1 AND chunk_index IS NULL", [document.id])).rows[0];
    expect(final.content).toContain("summary:");
    expect(ai.mergeSummaries).toHaveBeenCalledWith(`${ordered[0].content} ${ordered[1].content}`);
    expect(await getQueue("notify").getWaitingCount()).toBe(1);
    const completed = (await db.query("SELECT status, completed_at FROM documents WHERE id = $1", [document.id])).rows[0];
    expect(completed.status).toBe("done");
    expect(completed.completed_at).not.toBeNull();
  });

  it("marks failed jobs and documents failed without marking processing complete", async () => {
    const { document } = await createUserAndDocument();
    const summarizeJob = await createJob(document.id, "summarize");
    await expect(processSummarizeJob(fakeJob({
      documentId: document.id,
      jobType: "summarize",
      data: { chunk: "", jobId: summarizeJob.id, chunkIndex: 0 },
    }))).rejects.toThrow("No chunk provided");

    const failedJob = (await db.query("SELECT status, error, completed_at FROM jobs WHERE id = $1", [summarizeJob.id])).rows[0];
    expect(failedJob.status).toBe("failed");
    expect(failedJob.error).toContain("No chunk provided");
    expect(failedJob.completed_at).toBeNull();
    const failedDocument = (await db.query("SELECT status, completed_at FROM documents WHERE id = $1", [document.id])).rows[0];
    expect(failedDocument).toMatchObject({ status: "failed", completed_at: null });
    expect(await getQueue("notify").getWaitingCount()).toBe(0);
  });
});
