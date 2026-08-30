import { beforeEach } from "vitest";
import Redis from "ioredis";
import { db } from "../../src/db/client";

beforeEach(async () => {
  await db.query("TRUNCATE TABLE users CASCADE");
  const redis = new Redis({
    host: process.env.REDIS_HOST,
    port: Number(process.env.REDIS_PORT),
    maxRetriesPerRequest: 1,
  });
  await redis.flushdb();
  await redis.quit();
});
