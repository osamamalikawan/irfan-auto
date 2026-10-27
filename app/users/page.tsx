import { redirect } from "next/navigation";
import UsersView from "@/components/UsersView";
import { getUser } from "@/lib/auth";
import { hasPerm } from "@/lib/permissions";

export default async function Page() {
  const user = await getUser();
  if (!hasPerm(user, "users.manage")) redirect("/inventory");
  return <UsersView />;
}
