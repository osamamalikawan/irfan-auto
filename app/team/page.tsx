import { redirect } from "next/navigation";
import TeamView from "@/components/TeamView";
import { getUser } from "@/lib/auth";
import { hasAny } from "@/lib/permissions";

export default async function Page() {
  if (!hasAny(await getUser(), ["reports.view", "targets.manage"])) redirect("/dashboard");
  return <TeamView />;
}
