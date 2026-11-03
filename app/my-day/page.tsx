import { redirect } from "next/navigation";
import MyDayView from "@/components/MyDayView";
import { getUser } from "@/lib/auth";
import { hasAny } from "@/lib/permissions";

export default async function Page() {
  if (!hasAny(await getUser(), ["attendance.mark"])) redirect("/dashboard");
  return <MyDayView />;
}
