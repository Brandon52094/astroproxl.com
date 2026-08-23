import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is not set.");
}

// Reuse a single connection across hot reloads in dev, so we don't open a
// fresh Postgres connection on every file change.
const globalForDb = globalThis as unknown as { queryClient?: ReturnType<typeof postgres> };

const queryClient =
  globalForDb.queryClient ?? postgres(process.env.DATABASE_URL, { max: 10 });

if (process.env.NODE_ENV !== "production") {
  globalForDb.queryClient = queryClient;
}

export const db = drizzle(queryClient, { schema });