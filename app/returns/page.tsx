import { redirect } from "next/navigation";
import ReturnsView from "@/components/ReturnsView";
import { getUser } from "@/lib/auth";
import { hasAny } from "@/lib/permissions";

export default async function Page({ searchParams }: { searchParams: Promise<{ sale?: string; kind?: string }> }) {
  if (!hasAny(await getUser(), ["sales.return", "reports.view"])) redirect("/dashboard");
  const sp = await searchParams;
  const sale = sp.sale && /^[0-9a-f-]{36}$/i.test(sp.sale) ? sp.sale : undefined;
  return <ReturnsView key={(sale ?? "") + (sp.kind ?? "")} initialSale={sale} initialKind={sp.kind === "claim" ? "claim" : "return"} />;
}
