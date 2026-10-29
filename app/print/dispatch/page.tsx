import { redirect } from "next/navigation";
import DispatchPrint from "@/components/DispatchPrint";
import { getUser } from "@/lib/auth";
import { hasAny } from "@/lib/permissions";

// Printing page: no menus, just the vouchers.
export default async function Page({ searchParams }: { searchParams: Promise<{ ids?: string; mode?: string }> }) {
  const user = await getUser();
  if (!user) redirect("/login");
  if (!hasAny(user, ["sales.create", "stock.view", "stock.transfer"])) redirect("/");
  const sp = await searchParams;
  const ids = (sp.ids ?? "").split(",").filter((x) => /^[0-9a-f-]{36}$/i.test(x)).slice(0, 50);
  if (!ids.length) redirect("/dispatch");
  return <DispatchPrint ids={ids} mode={sp.mode === "a4" ? "a4" : "thermal"} />;
}
