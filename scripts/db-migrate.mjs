import { createClient } from "@libsql/client";

const url = process.env.TURSO_DATABASE_URL;
const authToken = process.env.TURSO_AUTH_TOKEN;

if (!url || !authToken) {
  console.error("Missing TURSO_DATABASE_URL or TURSO_AUTH_TOKEN.");
  process.exit(1);
}

const db = createClient({ url, authToken });

await db.execute(
  `CREATE TABLE IF NOT EXISTS history_items (
    id TEXT PRIMARY KEY,
    collection_id TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    prompt TEXT,
    style TEXT,
    model_id TEXT,
    aspect TEXT,
    seed INTEGER,
    width INTEGER,
    height INTEGER,
    image_url TEXT
  );`
);
await db.execute(
  `CREATE INDEX IF NOT EXISTS idx_history_collection_created
   ON history_items(collection_id, created_at DESC);`
);

console.log("Database schema is ready.");
