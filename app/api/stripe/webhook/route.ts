import { NextResponse } from "next/server";
import Stripe from "stripe";
import { clerkClient } from "@clerk/nextjs/server";

export async function POST(req: Request) {
  // Initialize Stripe safely inside the request runtime
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
    apiVersion: "2023-10-16",
  });

  const body = await req.text();
  const signature = req.headers.get("stripe-signature");

  if (!signature) {
    return new NextResponse("Missing stripe-signature header", { status: 400 });
  }

  try {
    const event = stripe.webhooks.constructEvent(
      body,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET!
    );

    // Everything below this line is now safely inside the function body!
    const session = event.data.object as Stripe.Checkout.Session;
    const userId = session.metadata?.userId;
    const mode = session.metadata?.mode;

    if (!userId || !mode) {
      console.error("[webhook] Missing userId or mode in metadata");
      return NextResponse.json({ error: "Missing metadata" }, { status: 400 });
    }

    switch (event.type) {
      case "checkout.session.completed": {
        try {
          if (userId) {
            await clerkClient.users.updateUserMetadata(userId, {
              publicMetadata: { isPro: true },
            });
          }
        } catch (err: any) {
          console.error("[webhook] Failed to update user metadata:", err);
          return NextResponse.json({ error: "Failed to update user" }, { status: 500 });
        }
        break;
      }
      
      // If you have other subscription cancellation cases later, they go here smoothly
    }

    // Return statement allowed here because it's inside the POST function context
    return NextResponse.json({ received: true });

  } catch (err: any) {
    console.error(`[Stripe Webhook Error]: ${err.message}`);
    return NextResponse.json({ error: "Webhook verification failed" }, { status: 400 });
  }
}
