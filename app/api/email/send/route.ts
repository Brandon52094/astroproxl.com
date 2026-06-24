// app/api/email/send/route.ts
// Generic send endpoint — used internally by other routes/jobs.
// Not exposed to the client directly.

import { NextRequest, NextResponse } from "next/server";
import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);

interface SendEmailBody {
  to: string;
  subject: string;
  html: string;
}

export async function POST(request: NextRequest) {
  try {
    // Protect this route — only callable with the internal secret
    const internalSecret = request.headers.get("x-internal-secret");
    if (internalSecret !== process.env.INTERNAL_API_SECRET) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json() as SendEmailBody;
    if (!body.to || !body.subject || !body.html) {
      return NextResponse.json({ error: "Missing required fields." }, { status: 400 });
    }

    const result = await resend.emails.send({
      from: "AstroProXL <hello@astroproxl.com>",
      to: body.to,
      subject: body.subject,
      html: body.html,
    });

    if (result.error) {
      console.error("[email/send] Resend error:", result.error);
      return NextResponse.json({ error: "Failed to send email." }, { status: 502 });
    }

    console.log(`[email/send] Sent "${body.subject}" to ${body.to}`);
    return NextResponse.json({ success: true, id: result.data?.id });

  } catch (error) {
    console.error("[email/send] Unexpected error:", error);
    return NextResponse.json({ error: "Something went wrong." }, { status: 500 });
  }
}