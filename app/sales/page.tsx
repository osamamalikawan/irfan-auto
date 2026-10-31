import { redirect } from "next/navigation";
import SalesList from "@/components/SalesList";
import { getUser } from "@/lib/auth";
import { hasAny } from "@/lib/permissions";

export default async function Page({ searchParams }: { searchParams: Promise<{ status?: string; range?: string }> }) {
  if (!hasAny(await getUser(), ["sales.create", "payments.receive"])) redirect("/");
  const sp = await searchParams;
  const status = ["confirmed", "cancelled"].includes(sp.status ?? "") ? sp.status! : "";
  const range = ["today", "week", "month", "all"].includes(sp.range ?? "") ? sp.range! : "today";
  return <SalesList key={status + range} initialStatus={status} initialRange={range} />;
}
