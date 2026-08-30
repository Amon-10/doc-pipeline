import { describe, expect, it, vi } from "vitest";
import { db } from "../../src/db/client";
import { createJob, createUserAndDocument, fakeJob } from "./helpers";

const resendSend = vi.hoisted(() => vi.fn(async () => ({ data: { id: "email-id" }, error: null })));
vi.mock("resend", () => ({
  Resend: class {
    emails = { send: resendSend };
  },
}));

import { processNotifyJob } from "../../src/workers/notify.worker";

describe("email notification integration", () => {
  it("uses Resend with the owner's email, EMAIL_FROM, and completed summary", async () => {
    const { user, document } = await createUserAndDocument("recipient@example.com");
    const notifyJob = await createJob(document.id, "notify");
    const summary = "The completed document summary.";

    await processNotifyJob(fakeJob({
      documentId: document.id,
      jobType: "notify",
      data: { jobId: notifyJob.id, summary },
    }));

    expect(user.email).toBe("recipient@example.com");
    expect(resendSend).toHaveBeenCalledOnce();
    expect(resendSend).toHaveBeenCalledWith({
      from: "summaries@test.example",
      to: "recipient@example.com",
      subject: "Your document summary is ready",
      text: summary,
    });
    expect((await db.query("SELECT status, completed_at FROM jobs WHERE id = $1", [notifyJob.id])).rows[0])
      .toMatchObject({ status: "completed" });
  });
});
