import { redirect } from "next/navigation";
import InvoiceBuilder from "@/components/InvoiceBuilder";
import { getUser } from "@/lib/auth";
import { hasPerm } from "@/lib/permissions";

export default async function Page({ searchParams }: { searchParams: Promise<{ customer?: string }> }) {
  if (!hasPerm(await getUser(), "sales.create")) redirect("/sales");
  const { customer } = await searchParams;
  return <InvoiceBuilder key={customer ?? "new"} customerId={customer} />;
}
