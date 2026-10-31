import { redirect } from "next/navigation";
import RoutePlanDetail from "@/components/RoutePlanDetail";
import { getUser } from "@/lib/auth";
import { hasAny } from "@/lib/permissions";

export default async function Page({ params }: { params: Promise<{ routeId: string; date: string }> }) {
  if (!hasAny(await getUser(), ["planner.edit", "visits.record", "routes.manage", "reports.view"])) redirect("/");
  const { routeId, date } = await params;
  return <RoutePlanDetail routeId={routeId} date={date} />;
}
