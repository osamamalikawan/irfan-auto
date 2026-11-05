import { redirect } from "next/navigation";
import InvoiceEntry from "@/components/InvoiceEntry";
import { getUser } from "@/lib/auth";
import { hasPerm } from "@/lib/permissions";

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  if (!hasPerm(await getUser(), "sales.edit")) redirect("/sales");
  const { id } = await params;
  return <InvoiceEntry key={id} editId={id} />;
}
