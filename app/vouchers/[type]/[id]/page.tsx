import VoucherView from "@/components/VoucherView";

export default async function Page({ params }: { params: Promise<{ type: string; id: string }> }) {
  const { type, id } = await params;
  return <VoucherView type={type} id={id} />;
}
