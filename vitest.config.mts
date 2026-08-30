import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    fileParallelism: false,
    globalSetup: ["./tests/integration/global-setup.ts"],
    setupFiles: ["./tests/integration/setup.ts"],
    env: {
      NODE_ENV: "test",
      DATABASE_URL: process.env.TEST_DATABASE_URL ?? "postgresql://pipeline:pipeline@127.0.0.1:5433/pipeline_test",
      REDIS_HOST: process.env.TEST_REDIS_HOST ?? "127.0.0.1",
      REDIS_PORT: process.env.TEST_REDIS_PORT ?? "6380",
      JWT_SECRET: "integration-test-jwt-secret",
      OPENAI_API_KEY: "integration-test-openai-key",
      RESEND_API_KEY: "integration-test-resend-key",
      EMAIL_FROM: "summaries@test.example",
    },
  },
});
