import { auth, currentUser } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";

const REFERRAL_COOKIE = "aproxl_ref";
const REFERRAL_COOKIE_MAX_AGE = 60 * 60 * 24 * 30; // 30 days — generous window to sign up and buy

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ ref?: string }>;
}) {
  const params = await searchParams;

  // Capture ?ref=CODE before anything else happens. This has to run here,
  // server-side, on the very first request — by the time any client-side
  // code could run, the redirect below has already sent the browser
  // elsewhere and the query param is gone. A cookie is the one thing that
  // survives that redirect, including through the entire Clerk sign-up flow.
  if (params.ref) {
    const cookieStore = await cookies();
    // Only set it if there isn't one already — first-touch attribution.
    // Someone clicking a second, different friend's link later shouldn't
    // silently steal credit from the first link they actually signed up
    // through.
    const existing = cookieStore.get(REFERRAL_COOKIE);
    if (!existing) {
      cookieStore.set(REFERRAL_COOKIE, params.ref, {
        maxAge: REFERRAL_COOKIE_MAX_AGE,
        path: "/",
        sameSite: "lax",
      });
    }
  }

  const { userId } = await auth();
  if (!userId) {
    redirect("/sign-in");
  }

  const user = await currentUser();
  const chartCompleted = user?.publicMetadata?.chartCompleted === true;
  if (chartCompleted) {
    redirect("/reading/intake");
  }
  redirect("/chart-data");
}
