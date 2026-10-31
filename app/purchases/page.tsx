import { redirect } from "next/navigation";
import PurchasesList from "@/components/PurchasesList";
import { getUser } from "@/lib/auth";
import { hasAny } from "@/lib/permissions";

export default async function Page() {
  if (!hasAny(await getUser(), ["purchases.create", "purchases.cancel", "suppliers.view"])) redirect("/");
  return <PurchasesList />;
}
