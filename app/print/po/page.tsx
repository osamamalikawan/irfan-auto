import { redirect } from "next/navigation";
import PurchaseOrderPrint from "@/components/PurchaseOrderPrint";
import { getUser } from "@/lib/auth";
import { hasAny } from "@/lib/permissions";

export default async function Page({ searchParams }: { searchParams: Promise<{ id?: string }> }) {
  const user = await getUser();
  if (!user) redirect("/login");
  if (!hasAny(user, ["purchases.create", "purchases.cancel", "suppliers.view", "suppliers.edit"])) redirect("/dashboard");
  const { id } = await searchParams;
  if (!id || !/^[0-9a-f-]{36}$/i.test(id)) redirect("/suppliers");
  return <PurchaseOrderPrint id={id} />;
}
