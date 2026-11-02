import { redirect } from "next/navigation";
import MarketView from "@/components/MarketView";
import { getUser } from "@/lib/auth";
import { hasAny } from "@/lib/permissions";

export default async function Page() {
  if (!hasAny(await getUser(), ["stock.manage", "accounts.edit", "reports.view", "sales.create"])) redirect("/dashboard");
  return <MarketView />;
}
