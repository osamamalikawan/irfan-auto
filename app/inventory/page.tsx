import InventoryList from "@/components/InventoryList";

export default async function Page({ searchParams }: { searchParams: Promise<{ filter?: string }> }) {
  const { filter } = await searchParams;
  const f = ["low", "out", "norack"].includes(filter ?? "") ? filter! : "all";
  return <InventoryList key={f} initialFilter={f} />;
}
