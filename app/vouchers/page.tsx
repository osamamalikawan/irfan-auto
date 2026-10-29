import { redirect } from "next/navigation";
import VouchersView from "@/components/VouchersView";
import { getUser } from "@/lib/auth";
import { hasAny } from "@/lib/permissions";

export default async function Page() {
  if (!hasAny(await getUser(), ["payments.receive", "accounts.edit", "reports.view"])) redirect("/");
  return <VouchersView />;
}
