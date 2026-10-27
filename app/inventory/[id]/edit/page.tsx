import { redirect } from "next/navigation";
import ProductForm from "@/components/ProductForm";
import { getUser } from "@/lib/auth";
import { hasPerm } from "@/lib/permissions";

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!hasPerm(await getUser(), "stock.manage")) redirect("/inventory/" + id);
  return <ProductForm id={id} />;
}
