import { redirect } from "next/navigation";
import InventoryList from "@/components/InventoryList";
import { getUser } from "@/lib/auth";
import { hasAny } from "@/lib/permissions";

export default async function Page({ searchParams }: { searchParams: Promise<{ filter?: string }> }) {
  if (!hasAny(await getUser(), ["stock.view", "stock.transfer", "stock.adjust"])) redirect("/");
  const { filter } = await searchParams;
  const f = ["low", "out", "norack"].includes(filter ?? "") ? filter! : "all";
  return <InventoryList key={f} initialFilter={f} />;
}
