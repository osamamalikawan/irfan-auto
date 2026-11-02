import InvoiceView from "@/components/InvoiceView";

export default async function Page({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ print?: string }> }) {
  const { id } = await params;
  const { print } = await searchParams;
  return <InvoiceView id={id} autoPrint={print === "1"} />;
}
