import { redirect } from "next/navigation";
import SalesList from "@/components/SalesList";
import { getUser } from "@/lib/auth";
import { hasAny } from "@/lib/permissions";

export default async function Page() {
  if (!hasAny(await getUser(), ["sales.create", "payments.receive"])) redirect("/");
  return <SalesList />;
}
