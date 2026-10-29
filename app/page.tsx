import { redirect } from "next/navigation";
import { getUser } from "@/lib/auth";
import { hasAny } from "@/lib/permissions";

export default async function Home() {
  const user = await getUser();
  if (!user) redirect("/login");
  if (user.mustChangePin) redirect("/change-pin");
  if (hasAny(user, ["sales.create", "payments.receive"])) redirect("/sales");
  if (hasAny(user, ["stock.view", "stock.transfer", "stock.adjust"])) redirect("/inventory");
  if (hasAny(user, ["customers.view", "customers.edit"])) redirect("/customers");
  if (hasAny(user, ["accounts.edit", "reports.view"])) redirect("/expenses");
  redirect("/account");
}
