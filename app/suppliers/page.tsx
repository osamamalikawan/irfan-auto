import { redirect } from "next/navigation";
import SuppliersList from "@/components/SuppliersList";
import { getUser } from "@/lib/auth";
import { hasAny } from "@/lib/permissions";

export default async function Page() {
  if (!hasAny(await getUser(), ["suppliers.view", "suppliers.edit", "suppliers.pay", "purchases.create"])) redirect("/");
  return <SuppliersList />;
}
