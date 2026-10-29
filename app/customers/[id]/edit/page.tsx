import { redirect } from "next/navigation";
import CustomerForm from "@/components/CustomerForm";
import { getUser } from "@/lib/auth";
import { hasPerm } from "@/lib/permissions";

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!hasPerm(await getUser(), "customers.edit")) redirect("/customers/" + id);
  return <CustomerForm id={id} />;
}
