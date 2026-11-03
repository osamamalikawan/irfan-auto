import { redirect } from "next/navigation";
import ListPrint from "@/components/ListPrint";
import { getUser } from "@/lib/auth";
import { hasAny } from "@/lib/permissions";

export default async function Page({ searchParams }: { searchParams: Promise<{ id?: string; cols?: string }> }) {
  const user = await getUser();
  if (!user) redirect("/login");
  if (!hasAny(user, ["stock.view", "stock.manage"])) redirect("/dashboard");
  const { id, cols } = await searchParams;
  if (!id || !/^[0-9a-f-]{36}$/i.test(id)) redirect("/lists");
  const allowed = ["name", "ur", "code", "price", "pp", "scheme"];
  const chosen = (cols ?? "name,ur,price,scheme").split(",").filter((c) => allowed.includes(c));
  return <ListPrint listId={id} cols={chosen.length ? chosen : ["name", "price"]} />;
}
