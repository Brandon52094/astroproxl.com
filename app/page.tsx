import { auth, currentUser } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";

export default async function Page() {
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