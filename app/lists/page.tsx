import { redirect } from "next/navigation";
import ListsView from "@/components/ListsView";
import { getUser } from "@/lib/auth";
import { hasAny } from "@/lib/permissions";

export default async function Page() {
  if (!hasAny(await getUser(), ["stock.view", "stock.manage"])) redirect("/dashboard");
  return <ListsView />;
}
