import { readFile } from "node:fs/promises";
import path from "node:path";
import { Pool } from "pg";
import Redis from "ioredis";

const databaseUrl = process.env.TEST_DATABASE_URL ?? "postgresql://pipeline:pipeline@127.0.0.1:5433/pipeline_test";
const redisHost = process.env.TEST_REDIS_HOST ?? "127.0.0.1";
const redisPort = Number(process.env.TEST_REDIS_PORT ?? 6380);

function assertIsTestDatabase(url: string) {
  const parsed = new URL(url);
  if (!parsed.pathname.toLowerCase().includes("test")) {
    throw new Error(`Integration tests require a database whose name contains "test"; received ${parsed.pathname}`);
  }
}

export default async function setup() {
  assertIsTestDatabase(databaseUrl);
  const pool = new Pool({ connectionString: databaseUrl });

  try {
    await pool.query("DROP SCHEMA public CASCADE; CREATE SCHEMA public");
    for (const migration of ["001_init.sql", "002_add_total_chunks.sql", "003_add_email.sql", "004_add_users.sql", "005_add_user_id.sql"]) {
      const sql = await readFile(path.resolve("src/db/migrations", migration), "utf8");
      await pool.query(sql);
    }
  } finally {
    await pool.end();
  }

  const redis = new Redis({ host: redisHost, port: redisPort, maxRetriesPerRequest: 1 });
  await redis.flushdb();
  await redis.quit();
}
