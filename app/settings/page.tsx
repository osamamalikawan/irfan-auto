import { redirect } from "next/navigation";
import SettingsView from "@/components/SettingsView";
import { getUser } from "@/lib/auth";
import { hasPerm } from "@/lib/permissions";

export default async function Page() {
  if (!hasPerm(await getUser(), "settings.edit")) redirect("/inventory");
  return <SettingsView />;
}
