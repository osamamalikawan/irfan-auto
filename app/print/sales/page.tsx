import { redirect } from "next/navigation";
import SalePrint, { type PrintType } from "@/components/SalePrint";
import { getUser } from "@/lib/auth";
import { hasAny } from "@/lib/permissions";

// Printing page: no menus, just the slips. type = invoice | gateout | delivery, layout = roll (80mm) | a4.
export default async function Page({ searchParams }: { searchParams: Promise<{ ids?: string; type?: string; layout?: string; embed?: string }> }) {
  const user = await getUser();
  if (!user) redirect("/login");
  if (!hasAny(user, ["sales.create", "payments.receive", "stock.view", "stock.transfer"])) redirect("/dashboard");
  const sp = await searchParams;
  const ids = (sp.ids ?? "").split(",").filter((x) => /^[0-9a-f-]{36}$/i.test(x)).slice(0, 60);
  if (!ids.length) redirect("/sales");
  const type: PrintType = sp.type === "gateout" || sp.type === "delivery" ? sp.type : "invoice";
  const layout = sp.layout === "a4" ? "a4" : "roll";
  return <SalePrint ids={ids} type={type} layout={layout} embed={sp.embed === "1"} />;
}
