import type { Server } from "node:http";
import type { Job } from "bullmq";
import type { JobPayload } from "../../src/queues/pipeline.queue";

export async function startApi(): Promise<{ baseUrl: string; close: () => Promise<void> }> {
  const { app } = await import("../../src/app");
  const server: Server = await new Promise((resolve) => {
    const listener = app.listen(0, "127.0.0.1", () => resolve(listener));
  });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Test server did not bind a TCP port");
  return {
    baseUrl: `http://127.0.0.1:${address.port}`,
    close: () => new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve())),
  };
}

export async function register(baseUrl: string, email: string, password = "password-123") {
  return fetch(`${baseUrl}/register`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
}

export async function login(baseUrl: string, email: string, password = "password-123"): Promise<string> {
  const response = await fetch(`${baseUrl}/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const body = await response.json() as { token: string };
  if (!response.ok) throw new Error(`Login failed: ${JSON.stringify(body)}`);
  return body.token;
}

export function fakeJob(payload: JobPayload): Job<JobPayload> {
  return { data: payload } as Job<JobPayload>;
}

export async function createUserAndDocument(email = "owner@example.com") {
  const { db } = await import("../../src/db/client");
  const user = (await db.query(
    "INSERT INTO users(email, password_hash) VALUES ($1, 'hash') RETURNING id, email",
    [email],
  )).rows[0];
  const document = (await db.query(
    `INSERT INTO documents(filename, original_name, status, user_id)
     VALUES ('stored.pdf', 'document.pdf', 'processing', $1) RETURNING *`,
    [user.id],
  )).rows[0];
  return { user, document };
}

export async function createJob(documentId: string, jobType: string) {
  const { db } = await import("../../src/db/client");
  return (await db.query(
    "INSERT INTO jobs(document_id, job_type, status) VALUES ($1, $2, 'pending') RETURNING *",
    [documentId, jobType],
  )).rows[0];
}
