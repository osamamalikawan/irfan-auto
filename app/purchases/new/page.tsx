import { redirect } from "next/navigation";
import PurchaseBuilder from "@/components/PurchaseBuilder";
import { getUser } from "@/lib/auth";
import { hasPerm } from "@/lib/permissions";

export default async function Page({ searchParams }: { searchParams: Promise<{ supplier?: string }> }) {
  if (!hasPerm(await getUser(), "purchases.create")) redirect("/purchases");
  const { supplier } = await searchParams;
  return <PurchaseBuilder key={supplier ?? "new"} supplierId={supplier} />;
}
