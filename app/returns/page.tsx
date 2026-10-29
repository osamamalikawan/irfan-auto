import { redirect } from "next/navigation";
import ReturnsView from "@/components/ReturnsView";
import { getUser } from "@/lib/auth";
import { hasAny } from "@/lib/permissions";

export default async function Page() {
  if (!hasAny(await getUser(), ["sales.return", "reports.view"])) redirect("/");
  return <ReturnsView />;
}
