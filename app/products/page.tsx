import { redirect } from "next/navigation";
import ProductsView from "@/components/ProductsView";
import { getUser } from "@/lib/auth";
import { hasAny } from "@/lib/permissions";

export default async function Page() {
  if (!hasAny(await getUser(), ["stock.view", "stock.manage"])) redirect("/dashboard");
  return <ProductsView />;
}
