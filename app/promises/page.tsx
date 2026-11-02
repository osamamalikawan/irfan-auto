import { redirect } from "next/navigation";
import PromisesView from "@/components/PromisesView";
import { getUser } from "@/lib/auth";
import { hasAny } from "@/lib/permissions";

export default async function Page() {
  if (!hasAny(await getUser(), ["visits.record", "payments.receive", "reports.view", "customers.view"])) redirect("/dashboard");
  return <PromisesView />;
}
