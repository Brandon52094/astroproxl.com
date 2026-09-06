import { NextResponse } from "next/server";
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

export const POST = handlers.initial;

export async function GET() {
  return NextResponse.json({
    status: "ok",
    endpoint: "/api/readings",
    method: "POST",
  });
}