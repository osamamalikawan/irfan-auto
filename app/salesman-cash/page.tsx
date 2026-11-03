import { redirect } from "next/navigation";
import SalesmanCashView from "@/components/SalesmanCashView";
import { getUser } from "@/lib/auth";
import { hasAny } from "@/lib/permissions";

export default async function Page() {
  if (!hasAny(await getUser(), ["accounts.edit"])) redirect("/dashboard");
  return <SalesmanCashView />;
}
