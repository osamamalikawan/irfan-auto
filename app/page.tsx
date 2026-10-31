import { redirect } from "next/navigation";
import { getUser } from "@/lib/auth";

// Everybody lands on the Dashboard; it shows only what their role may see.
export default async function Home() {
  const user = await getUser();
  if (!user) redirect("/login");
  if (user.mustChangePin) redirect("/change-pin");
  redirect("/dashboard");
}
