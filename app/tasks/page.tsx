import { redirect } from "next/navigation";
import TasksView from "@/components/TasksView";
import { getUser } from "@/lib/auth";
import { hasAny } from "@/lib/permissions";

export default async function Page() {
  if (!hasAny(await getUser(), ["sales.create", "sales.status", "payments.receive", "visits.record", "reports.view", "customers.view"])) redirect("/dashboard");
  return <TasksView />;
}
