import { Pool } from "pg";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

pool.on("error", (err) => {
  console.error("Unexpected Postgres error:", err);
  process.exit(1);
});

export const db = {
  query: (text: string, params?: unknown[]) => pool.query(text, params),
};