import { redirect } from "next/navigation";
import DispatchView from "@/components/DispatchView";
import { getUser } from "@/lib/auth";
import { hasAny } from "@/lib/permissions";

export default async function Page() {
  if (!hasAny(await getUser(), ["sales.create", "stock.view", "stock.transfer"])) redirect("/");
  return <DispatchView />;
}
