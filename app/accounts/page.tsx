import { redirect } from "next/navigation";
import AccountsView from "@/components/AccountsView";
import { getUser } from "@/lib/auth";
import { hasAny } from "@/lib/permissions";

export default async function Page() {
  if (!hasAny(await getUser(), ["accounts.edit", "reports.view"])) redirect("/");
  return <AccountsView />;
}
