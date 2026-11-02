import { redirect } from "next/navigation";
import DiscountsView from "@/components/DiscountsView";
import { getUser } from "@/lib/auth";
import { hasAny } from "@/lib/permissions";

export default async function Page() {
  if (!hasAny(await getUser(), ["sales.discount", "settings.edit"])) redirect("/dashboard");
  return <DiscountsView />;
}
