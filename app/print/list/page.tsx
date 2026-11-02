import { redirect } from "next/navigation";
import ListPrint from "@/components/ListPrint";
import { getUser } from "@/lib/auth";
import { hasAny } from "@/lib/permissions";

export default async function Page({ searchParams }: { searchParams: Promise<{ id?: string }> }) {
  const user = await getUser();
  if (!user) redirect("/login");
  if (!hasAny(user, ["stock.view", "stock.manage"])) redirect("/dashboard");
  const { id } = await searchParams;
  if (!id || !/^[0-9a-f-]{36}$/i.test(id)) redirect("/lists");
  return <ListPrint listId={id} />;
}
