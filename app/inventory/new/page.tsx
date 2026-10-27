import { redirect } from "next/navigation";
import ProductForm from "@/components/ProductForm";
import { getUser } from "@/lib/auth";
import { hasPerm } from "@/lib/permissions";

export default async function Page() {
  if (!hasPerm(await getUser(), "stock.manage")) redirect("/inventory");
  return <ProductForm />;
}
