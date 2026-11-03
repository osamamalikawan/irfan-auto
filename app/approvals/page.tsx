import { redirect } from "next/navigation";
import ApprovalsView from "@/components/ApprovalsView";
import { getUser } from "@/lib/auth";
import { hasAny } from "@/lib/permissions";

export default async function Page() {
  if (!hasAny(await getUser(), ["requests.approve"])) redirect("/dashboard");
  return <ApprovalsView />;
}
