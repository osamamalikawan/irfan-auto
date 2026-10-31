import { redirect } from "next/navigation";
import UsersView from "@/components/UsersView";
import { getUser } from "@/lib/auth";
import { hasPerm } from "@/lib/permissions";

export default async function Page({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const user = await getUser();
  if (!hasPerm(user, "users.manage")) redirect("/inventory");
  const { tab } = await searchParams;
  const t = tab === "roles" ? "roles" : "users";
  return <UsersView key={t} initialTab={t} />;
}
