import { NextRequest, NextResponse } from "next/server";

const REFERRAL_COOKIE = "aproxl_ref";
const REFERRAL_COOKIE_MAX_AGE = 60 * 60 * 24 * 30;

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams
    .get("code")
    ?.trim()
    .toUpperCase();

  const destination = new URL("/", request.url);

  if (!code || !/^[A-Z0-9_-]{4,64}$/.test(code)) {
    destination.searchParams.set("referral", "invalid");
    return NextResponse.redirect(destination);
  }

  const response = NextResponse.redirect(destination);
  response.cookies.set({
    name: REFERRAL_COOKIE,
    value: code,
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: REFERRAL_COOKIE_MAX_AGE,
  });

  return response;
}
