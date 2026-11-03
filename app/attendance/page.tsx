import { redirect } from "next/navigation";
import AttendanceView from "@/components/AttendanceView";
import { getUser } from "@/lib/auth";
import { hasAny } from "@/lib/permissions";

export default async function Page() {
  if (!hasAny(await getUser(), ["attendance.view"])) redirect("/dashboard");
  return <AttendanceView />;
}
