import { createReadingCompleteHandler } from "@/lib/reading/reading-complete";
import { postgresReadingUsage } from "@/lib/reading/postgres-stores";

export const runtime = "nodejs";
export const POST = createReadingCompleteHandler(postgresReadingUsage);
