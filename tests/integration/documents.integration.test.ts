import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { unlink } from "node:fs/promises";
import path from "node:path";
import { db } from "../../src/db/client";
import { getQueue } from "../../src/queues/pipeline.queue";
import { login, register, startApi } from "./helpers";

describe("document upload and ownership integration", () => {
  let baseUrl: string;
  let close: () => Promise<void>;
  const uploadedFiles: string[] = [];

  beforeAll(async () => ({ baseUrl, close } = await startApi()));
  afterEach(async () => Promise.all(uploadedFiles.splice(0).map((file) => unlink(file).catch(() => undefined))));
  afterAll(async () => close());

  async function authenticatedUser(email: string) {
    await register(baseUrl, email);
    return login(baseUrl, email);
  }

  async function upload(token: string) {
    const form = new FormData();
    form.append("file", new Blob(["integration pdf bytes"], { type: "application/pdf" }), "integration.pdf");
    const response = await fetch(`${baseUrl}/upload`, {
      method: "POST",
      headers: { authorization: `Bearer ${token}` },
      body: form,
    });
    const body = await response.json() as { document: { id: string; filename: string; user_id: string; status: string } };
    if (body.document?.filename) uploadedFiles.push(path.resolve("uploads", body.document.filename));
    return { response, body };
  }

  it("uploads a valid document, persists ownership, and queues the initial extract job", async () => {
    const token = await authenticatedUser("uploader@example.com");
    const { response, body } = await upload(token);
    expect(response.status).toBe(201);
    expect(body.document.status).toBe("pending");

    const persisted = (await db.query("SELECT * FROM documents WHERE id = $1", [body.document.id])).rows[0];
    expect(persisted.user_id).toBe(body.document.user_id);
    const jobRecord = (await db.query("SELECT * FROM jobs WHERE document_id = $1", [body.document.id])).rows[0];
    expect(jobRecord).toMatchObject({ job_type: "extract", status: "pending" });

    const queued = await getQueue("extract").getWaiting();
    expect(queued).toHaveLength(1);
    expect(queued[0].data).toMatchObject({ documentId: body.document.id, jobType: "extract" });
    expect(queued[0].opts).toMatchObject({ attempts: 3, backoff: { type: "exponential", delay: 2000 } });
  });

  it("does not let one user access another user's document", async () => {
    const ownerToken = await authenticatedUser("owner@example.com");
    const strangerToken = await authenticatedUser("stranger@example.com");
    const { body } = await upload(ownerToken);

    const response = await fetch(`${baseUrl}/status/${body.document.id}`, {
      headers: { authorization: `Bearer ${strangerToken}` },
    });
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: "Document not found" });
  });

  it("returns processing state and then the persisted result for a completed document", async () => {
    const token = await authenticatedUser("results@example.com");
    const { body } = await upload(token);
    const headers = { authorization: `Bearer ${token}` };

    const processing = await fetch(`${baseUrl}/status/${body.document.id}`, { headers });
    expect(await processing.json()).toMatchObject({ document: { status: "pending" }, summary: null });

    await db.query("UPDATE documents SET status = 'done', completed_at = now() WHERE id = $1", [body.document.id]);
    await db.query("INSERT INTO summaries(document_id, chunk_index, content) VALUES ($1, NULL, $2)", [body.document.id, "Stored final result"]);
    const completed = await fetch(`${baseUrl}/status/${body.document.id}`, { headers });
    expect(await completed.json()).toMatchObject({ document: { status: "done" }, summary: "Stored final result" });
  });
});
