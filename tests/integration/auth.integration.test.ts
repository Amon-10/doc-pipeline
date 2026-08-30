import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { login, register, startApi } from "./helpers";

describe("authentication integration", () => {
  let baseUrl: string;
  let close: () => Promise<void>;

  beforeAll(async () => ({ baseUrl, close } = await startApi()));
  afterAll(async () => close());

  it("registers a user and logs in successfully", async () => {
    const registration = await register(baseUrl, "auth@example.com");
    const registrationText = await registration.text();
    expect(registration.status, registrationText).toBe(201);
    expect(JSON.parse(registrationText)).toMatchObject({ email: "auth@example.com" });

    const token = await login(baseUrl, "auth@example.com");
    expect(token.split(".")).toHaveLength(3);
  });

  it("rejects invalid login credentials", async () => {
    await register(baseUrl, "invalid-login@example.com");
    const response = await fetch(`${baseUrl}/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: "invalid-login@example.com", password: "wrong-password" }),
    });
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "Invalid credentials" });
  });

  it.each([
    ["without a JWT", undefined, "Missing Authorization header"],
    ["with an invalid JWT", "Bearer not-a-valid-jwt", "Invalid or expired token"],
  ])("rejects protected routes %s", async (_label, authorization, error) => {
    const headers = authorization ? { authorization } : undefined;
    const response = await fetch(`${baseUrl}/status/00000000-0000-0000-0000-000000000000`, { headers });
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error });
  });
});
