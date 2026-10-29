import { redirect } from "next/navigation";
import RoutesView from "@/components/RoutesView";
import { getUser } from "@/lib/auth";
import { hasPerm } from "@/lib/permissions";

export default async function Page() {
  if (!hasPerm(await getUser(), "routes.manage")) redirect("/account");
  return <RoutesView />;
}
