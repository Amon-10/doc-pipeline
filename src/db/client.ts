import { Pool } from "pg";

/**
 * Connection pool to Postgres.
 * A pool keeps multiple connections open simultaneously so concurrent workers
 * don't queue up waiting for a single connection — each grabs its own.
 * connectionString is read from environment so credentials never live in code.
 */
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

/**
 * Exit the process on unexpected Postgres errors.
 * A broken connection leaves the app in an unpredictable state —
 * crashing cleanly and restarting is safer than continuing with a bad connection.
 */
pool.on("error", (err) => {
  console.error("Unexpected Postgres error:", err);
  process.exit(1);
});

/**
 * Thin wrapper around the connection pool exposed to the rest of the app.
 * Centralizing queries here means swapping the database library only requires
 * changing this one file rather than every file that makes queries.
 *
 * @param text - SQL query string with $1, $2 placeholders
 * @param params - values that replace placeholders, preventing SQL injection
 */
export const db = {
  query: (text: string, params?: unknown[]) => pool.query(text, params),
  close: () => pool.end(),
};
