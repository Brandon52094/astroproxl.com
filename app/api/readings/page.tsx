import { NextResponse } from "next/server";
import { handleReading } from "@/lib/reading/handler";

export const POST = handleReading;

export async function GET() {
  return NextResponse.json({ status: "ok", endpoint: "/api/readings", method: "POST" });
}