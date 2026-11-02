import { redirect } from "next/navigation";
import InvoiceEntry from "@/components/InvoiceEntry";
import { getUser } from "@/lib/auth";
import { hasPerm } from "@/lib/permissions";

export default async function Page({ searchParams }: { searchParams: Promise<{ customer?: string }> }) {
  if (!hasPerm(await getUser(), "sales.create")) redirect("/sales");
  const { customer } = await searchParams;
  return <InvoiceEntry key={customer ?? "new"} customerId={customer} />;
}
