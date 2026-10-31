import { redirect } from "next/navigation";
import PlannerView from "@/components/PlannerView";
import { getUser } from "@/lib/auth";
import { hasAny } from "@/lib/permissions";

export default async function Page() {
  if (!hasAny(await getUser(), ["planner.edit", "visits.record", "routes.manage", "reports.view"])) redirect("/");
  return <PlannerView />;
}
