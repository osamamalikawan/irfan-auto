import { redirect } from "next/navigation";
import RoutePlansView from "@/components/RoutePlansView";
import { getUser } from "@/lib/auth";
import { hasAny } from "@/lib/permissions";

export default async function Page({ searchParams }: { searchParams: Promise<{ tab?: string; range?: string }> }) {
  if (!hasAny(await getUser(), ["planner.edit", "visits.record", "routes.manage", "reports.view"])) redirect("/");
  const sp = await searchParams;
  const tab = sp.tab === "completed" ? "completed" : "planned";
  const range = ["upcoming", "today", "week", "month"].includes(sp.range ?? "") ? sp.range! : "upcoming";
  return <RoutePlansView key={tab + range} initialTab={tab} initialRange={range} />;
}
