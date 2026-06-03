import { auth, currentUser } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";

export default async function Page() {
  const { userId } = await auth();

  if (!userId) {
    redirect("/sign-in");
  }

  // Check if user has already completed chart setup
  const user = await currentUser();
  const chartCompleted = user?.publicMetadata?.chartCompleted === true;

  if (chartCompleted) {
    // Returning user — skip chart setup
    redirect("/reading/intake");
  }

  // New user — needs to set up chart
  redirect("/chart-data");
}
