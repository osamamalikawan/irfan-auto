import { redirect } from "next/navigation";
import ListView from "@/components/ListView";
import { getUser } from "@/lib/auth";
import { hasAny } from "@/lib/permissions";

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  if (!hasAny(await getUser(), ["stock.view", "stock.manage"])) redirect("/dashboard");
  const { id } = await params;
  return <ListView id={id} />;
}
