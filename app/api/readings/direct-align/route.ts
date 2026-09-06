import { createReadingHandlers } from "@/lib/reading/staged-handler";
import {
  postgresReadingSessions,
  postgresReadingUsage,
} from "@/lib/reading/postgres-stores";

export const runtime = "nodejs";
export const maxDuration = 120;

const handlers = createReadingHandlers(
  postgresReadingSessions,
  postgresReadingUsage
);

export const GET = handlers.recover;
export const POST = handlers.align;